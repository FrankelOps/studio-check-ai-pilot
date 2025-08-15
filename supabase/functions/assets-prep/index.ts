import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const pdfcoKey    = Deno.env.get("PDFCO_API_KEY")!;
const DPI         = Number(Deno.env.get("RASTERIZE_DPI") ?? "300");
const TTL_SEC     = Number(Deno.env.get("RASTERIZE_TTL_SECONDS") ?? "3600");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { jobId, pages } = await req.json();
    if (!jobId) throw new Error("jobId is required");

    const sb = createClient(supabaseUrl, serviceKey);

    // Load job and source file
    const { data: job, error: je } = await sb.from("analysis_jobs").select("id, file_id, total_pages").eq("id", jobId).single();
    if (je || !job) throw new Error("job not found");

    const { data: file, error: fe } = await sb.from("uploaded_files").select("file_path, file_name, mime_type").eq("id", job.file_id).single();
    if (fe || !file) throw new Error("source file not found");

    // Signed URL to the source PDF
    const { data: signed } = await sb.storage.from("project-files").createSignedUrl(file.file_path, TTL_SEC);
    if (!signed?.signedUrl) throw new Error("failed to sign source PDF");

    // Compute page range
    const pgs: number[] = Array.isArray(pages) && pages.length ? pages.map((p: any) => Number(p)).filter((n) => Number.isFinite(n) && n > 0) : [1, 10];
    const minPage = Math.min(...pgs);
    const maxPage = Math.max(...pgs);
    const pagesRange = `${minPage}-${maxPage}`;

    // Kick off PDF.co async rasterize
    const startJob = await fetch("https://api.pdf.co/v1/pdf/convert/to/png", {
      method: "POST",
      headers: {
        "x-api-key": pdfcoKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: signed.signedUrl.startsWith("http") ? signed.signedUrl : `cache:${signed.signedUrl}`,
        async: true,
        pages: pagesRange,
        dpi: DPI,
        profiles: "keepOriginalRotation",
      }),
    });

    const startJson = await startJob.json();
    if (!startJob.ok || !startJson?.jobId) {
      return j({ success: false, error: `pdfco start failed: ${JSON.stringify(startJson)}` }, 502);
    }

    const jobIdPdfco = startJson.jobId as string;
    let pollUrl = startJson.url as string | undefined;

    // Poll for completion
    const deadline = Date.now() + 60_000; // 60s
    while (Date.now() < deadline) {
      const st = await fetch("https://api.pdf.co/v1/job/check", {
        method: "POST",
        headers: { "x-api-key": pdfcoKey, "Content-Type": "application/json" },
        body: JSON.stringify({ jobid: jobIdPdfco }),
      });
      const sj = await st.json();
      if (sj?.status === "success") {
        pollUrl = sj.url || pollUrl;
        break;
      }
      if (sj?.status === "failed") {
        return j({ success: false, error: `pdfco failed: ${JSON.stringify(sj)}` }, 502);
      }
      await delay(1500);
    }
    if (!pollUrl) return j({ success: false, error: "pdfco returned no result url" }, 502);

    // The result URL is a JSON manifest with per-page PNG signed URLs.
    const manifestResp = await fetch(pollUrl);
    if (!manifestResp.ok) return j({ success: false, error: "unable to fetch pdfco manifest" }, 502);
    const manifest = await manifestResp.json();
    const urls: string[] = Array.isArray(manifest?.urls) ? manifest.urls : [];

    if (!urls.length) return j({ success: false, error: "pdfco returned empty urls" }, 502);

    // Upsert page_assets rows for each page in [min..max]
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_SEC * 1000).toISOString();

    const rows = [];
    for (let i = 0; i < urls.length; i++) {
      const page = minPage + i;
      const image_url = urls[i];
      rows.push({
        job_id: jobId,
        page,
        image_url,
        dpi: DPI,
        width: null,
        height: null,
        hash: null,
        expires_at: expiresAt,
      });
    }

    // Upsert individually to avoid onConflict issues
    for (const row of rows) {
      await sb.from("page_assets").upsert(row, { onConflict: "job_id,page" });
    }

    return j({ success: true, jobId, pages: rows.map((r) => r.page), range: pagesRange, count: rows.length });
  } catch (e) {
    return j({ success: false, error: String(e?.message ?? e) }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }