import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const workerUrl = Deno.env.get("WORKER_SELF_URL")!; // e.g., https://<ref>.functions.supabase.co/analysis-worker
const DEFAULT_BATCH = Number(Deno.env.get("ANALYSIS_BATCH_SIZE") ?? "5");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { projectId, fileId, params } = await req.json();
    if (!projectId || !fileId) throw new Error("projectId and fileId are required");

    const sb = createClient(supabaseUrl, serviceKey);

    // Lookup the file metadata
    const { data: file, error: fe } = await sb
      .from("uploaded_files")
      .select("*")
      .eq("id", fileId)
      .single();
    if (fe || !file) throw new Error("file not found");

    // Count pages (PDF only). Non-PDF defaults to 1.
    let totalPages = 1;
    if ((file.mime_type ?? "").toLowerCase() === "application/pdf") {
      const { data: blob, error: de } = await sb.storage
        .from("project-files")
        .download(file.file_path);
      if (de || !blob) throw new Error("failed to download file");
      const buf = await blob.arrayBuffer();
      const pdf = await PDFDocument.load(buf);
      totalPages = pdf.getPageCount();
    }

    // Create job
    const { data: job, error: je } = await sb
      .from("analysis_jobs")
      .insert({
        project_id: projectId,
        file_id: fileId,
        status: "queued",
        total_pages: totalPages,
        processed_pages: 0,
        pass: 1,
        model: params?.model ?? "gpt-4o-mini",
        params: params ?? {}
      })
      .select()
      .single();
    if (je) throw je;

    // Seed page tasks
    const tasks = Array.from({ length: totalPages }, (_, i) => ({
      job_id: job.id,
      page: i + 1,
      state: "queued",
    }));
    const { error: te } = await sb.from("analysis_page_tasks").insert(tasks);
    if (te) throw te;

    // Kick the worker for the first batch
    if (!workerUrl) throw new Error("WORKER_SELF_URL not set");
    await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, batchSize: DEFAULT_BATCH }),
    });

    return new Response(JSON.stringify({ success: true, jobId: job.id, totalPages }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});