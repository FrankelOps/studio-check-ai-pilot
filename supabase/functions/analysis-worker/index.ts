import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openAIKey = Deno.env.get("OPENAI_API_KEY")!;
const assetsPrepUrl = Deno.env.get("ASSETS_PREP_URL")!; // e.g. https://<ref>.functions.supabase.co/assets-prep
const DEFAULT_BATCH = Number(Deno.env.get("ANALYSIS_BATCH_SIZE") ?? "5");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Finding = {
  category: string;
  risk: "High" | "Medium" | "Low";
  confidence: "High" | "Medium" | "Low";
  coordination_required: boolean;
  sheet_spec_reference: string;
  page: number;
  nearby_text_marker: string;
  issue: string;
  construction_impact: string;
  ai_reasoning: string;
  suggested_action: string;
  references: string[];
  cross_references: string[];
};

const SYSTEM_PROMPT = `
You are StudioCheck, an expert construction QA/QC reviewer.
Analyze the provided drawing page image (and optional OCR) and return JSON ONLY as { "findings": Finding[] }.
- Include low/medium/high confidence; do not omit possible issues—mark them "Low" confidence.
- Be specific about the nearest text/callout and sheet/detail references.
- Never return prose outside JSON.
`;

const FINDING_SCHEMA_TEXT = `
{
  "findings": [
    {
      "category": "Missing Information | Coordination Conflict | Spec/Product Conflict | Code/ADA Violation | Drawing/Spec Inconsistency | Other Red Flag",
      "risk": "High | Medium | Low",
      "confidence": "High | Medium | Low",
      "coordination_required": true,
      "sheet_spec_reference": "e.g., A101, Detail 3/A502, Panel A schedule",
      "page": <integer>,
      "nearby_text_marker": "closest note/label/callout text",
      "issue": "one-sentence problem statement",
      "construction_impact": "short, trade-aware impact statement",
      "ai_reasoning": "why this was flagged; cite visual/text evidence",
      "suggested_action": "clear next step (RFI, revise detail, coordinate M/E/P, etc.)",
      "references": ["FileName (Page X)"],
      "cross_references": ["other pages/sheets if cited"]
    }
  ]
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { jobId, batchSize } = await req.json();
    if (!jobId) throw new Error("jobId is required");
    const limit = Number(batchSize ?? DEFAULT_BATCH);

    const sb = createClient(supabaseUrl, serviceKey);

    // Load job
    const { data: job, error: je } = await sb.from("analysis_jobs").select("*").eq("id", jobId).single();
    if (je || !job) throw new Error("job not found");

    // Lock next N queued tasks (coarse-grained optimistic lock)
    const { data: queued, error: qe } = await sb
      .from("analysis_page_tasks")
      .select("*")
      .eq("job_id", jobId)
      .eq("state", "queued")
      .order("page", { ascending: true })
      .limit(limit);
    if (qe) throw qe;

    if (!queued?.length) {
      // Nothing left to do; if job is fully processed, mark complete.
      const newStatus = job.processed_pages >= job.total_pages ? "complete" : job.status;
      if (newStatus !== job.status) {
        await sb.from("analysis_jobs").update({ status: newStatus, finished_at: new Date().toISOString() }).eq("id", jobId);
      }
      return json({ success: true, jobId, locked: 0, message: "no queued tasks" });
    }

    const workerId = crypto.randomUUID();
    const pages = queued.map((t) => t.page);

    // Mark tasks as processing
    await sb.from("analysis_page_tasks")
      .update({ state: "processing", locked_by: workerId, locked_at: new Date().toISOString() })
      .in("page", pages)
      .eq("job_id", jobId)
      .eq("state", "queued"); // best-effort lock

    // Ensure assets exist for these pages via assets-prep (created in Prompt 4)
    if (!assetsPrepUrl) throw new Error("ASSETS_PREP_URL not set");
    const r = await fetch(assetsPrepUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, pages }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn("assets-prep failed", txt);
    }

    // Read assets
    const { data: assetsRows } = await sb
      .from("page_assets")
      .select("page,image_url,ocr_url")
      .eq("job_id", jobId)
      .in("page", pages);

    const assetsMap = new Map<number, { image_url?: string; ocr_text?: string }>();
    for (const row of assetsRows ?? []) {
      let ocrText: string | undefined;
      if (row.ocr_url) {
        try {
          const ocrResp = await fetch(row.ocr_url);
          ocrText = ocrResp.ok ? await ocrResp.text() : undefined;
        } catch {
          ocrText = undefined;
        }
      }
      assetsMap.set(row.page, { image_url: row.image_url ?? undefined, ocr_text: ocrText });
    }

    // Process each page
    let doneCount = 0;
    for (const page of pages) {
      try {
        const assets = assetsMap.get(page);
        if (!assets?.image_url) {
          const msg = "missing image_url for page";
          await markTask(sb, jobId, page, "error", msg);
          await upsertResult(sb, jobId, page, [], job.model ?? "gpt-4o-mini", "error", msg, 0);
          continue;
        }

        const start = performance.now();
        const findings = await analyzePage({
          page,
          total: job.total_pages,
          fileName: job.file_id,
          imageUrl: assets.image_url,
          ocrText: assets.ocr_text ?? "",
          model: job.model ?? "gpt-4o-mini",
        });
        const duration = Math.round(performance.now() - start);

        const status = findings.length ? "done" : "empty";
        await upsertResult(sb, jobId, page, findings, job.model ?? "gpt-4o-mini", status, null, duration);
        await markTask(sb, jobId, page, "done");
        doneCount++;

        // Increment job progress
        await sb.rpc("noop"); // placeholder to keep session alive (optional)
      } catch (e) {
        const err = String(e?.message ?? e);
        await markTask(sb, jobId, page, "error", err);
        await upsertResult(sb, jobId, page, [], job.model ?? "gpt-4o-mini", "error", err, 0);
      }
    }

    // Update job processed_pages
    const { data: countRows } = await sb
      .from("analysis_page_tasks")
      .select("*", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("state", "done");
    const processed = (countRows as unknown as { count: number } | null)?.count ?? null;

    await sb.from("analysis_jobs").update({
      processed_pages: processed ?? job.processed_pages + doneCount,
      status: (processed ?? 0) >= job.total_pages ? "complete" : "processing",
    }).eq("id", jobId);

    return json({ success: true, jobId, locked: pages.length, processed: doneCount });
  } catch (e) {
    return json({ success: false, error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function markTask(sb: ReturnType<typeof createClient>, jobId: string, page: number, state: string, last_error?: string) {
  await sb.from("analysis_page_tasks")
    .update({ state, last_error: last_error ?? null })
    .eq("job_id", jobId)
    .eq("page", page);
}

async function upsertResult(
  sb: ReturnType<typeof createClient>,
  jobId: string,
  page: number,
  findings: Finding[],
  model: string,
  status: "done" | "empty" | "error",
  error: string | null,
  duration_ms: number
) {
  // Always store an array
  const payload = {
    job_id: jobId,
    page,
    findings: findings ?? [],
    model,
    duration_ms,
    status,
    error,
  };

  // upsert by (job_id, page)
  const { error: ue } = await sb
    .from("analysis_page_results")
    .upsert(payload, { onConflict: "job_id,page" });
  if (ue) console.error("upsertResult error", ue);
}

async function analyzePage(opts: {
  page: number;
  total: number;
  fileName: string;
  imageUrl: string;
  ocrText: string;
  model: string;
}): Promise<Finding[]> {
  const userContent: any[] = [
    { type: "text", text: `Analyze page ${opts.page} of ${opts.total}. File: ${opts.fileName}. Return JSON ONLY following this schema: ${FINDING_SCHEMA_TEXT}` },
    { type: "image_url", image_url: { url: opts.imageUrl } },
  ];
  if (opts.ocrText && opts.ocrText.trim().length > 0) {
    userContent.push({ type: "text", text: `OCR_TEXT:\n${opts.ocrText.slice(0, 8000)}` });
  }

  const body = {
    model: opts.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openAIKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("OpenAI error", txt);
    return []; // don't throw—record empty to keep pipeline moving
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed?.findings) ? parsed.findings : [];
    return arr.filter(Boolean) as Finding[];
  } catch {
    return [];
  }
}