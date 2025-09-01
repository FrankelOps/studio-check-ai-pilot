import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { startTimer, endTimer, logInfo, logError, generateRequestId } from "../_shared/logger.ts";
import { titleBlockValidator } from "../_shared/qa-modules/title-block-validator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const request_id = generateRequestId();
  const logContext = { request_id, function_name: "qa-runner" };
  startTimer({ request_id, function_name: "qa-runner" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bucketName = Deno.env.get("PROJECT_FILES_BUCKET") ?? "project-files";
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { analysisId, fileId, fileUrl: fileUrlRaw, pages } = await req.json();
    
    if (!analysisId) {
      endTimer(request_id, false, new Error("analysisId is required"));
      return json({ error: "analysisId is required" }, { status: 400 });
    }

    // Auto-resolve file URL if not provided
    let fileUrl: string | null = (fileUrlRaw as string) || null;

    if (!fileUrl) {
      if (!fileId) {
        endTimer(request_id, false, new Error("Either fileUrl or fileId is required"));
        return json({ error: "Either fileUrl or fileId is required" }, { status: 400 });
      }

      // Fetch storage path from uploaded_files
      const { data: uf, error: ufErr } = await sb
        .from("uploaded_files")
        .select("file_path")
        .eq("id", fileId)
        .single();

      if (ufErr || !uf?.file_path) {
        logError("Failed to resolve file_path from uploaded_files", { ...logContext, fileId }, ufErr);
        endTimer(request_id, false, ufErr || new Error("file_path not found"));
        return json({ error: "Failed to resolve file path for fileId" }, { status: 400 });
      }

      // Create signed URL to original PDF
      const { data: signed, error: signErr } = await sb.storage
        .from(bucketName)
        .createSignedUrl(uf.file_path, 60 * 60); // 1 hour

      if (signErr || !signed?.signedUrl) {
        logError("Failed to sign file URL", { ...logContext, file_path: uf.file_path }, signErr);
        endTimer(request_id, false, signErr || new Error("signing failed"));
        return json({ error: "Failed to sign file URL" }, { status: 400 });
      }

      fileUrl = signed.signedUrl;
    }

    logInfo("QA runner: inputs resolved", { 
      ...logContext, 
      analysis_id: analysisId, 
      has_file_url: !!fileUrl, 
      pages_len: pages?.length ?? null 
    });

    // Run title block validator
    const findings = await titleBlockValidator.run({
      analysisId,
      fileUrl: fileUrl!,
      pages,
    });

    logInfo("QA runner: module completed", { 
      ...logContext, 
      module: titleBlockValidator.id, 
      findings_count: findings.length 
    });

    // Upsert findings to prevent duplicates on re-run
    const qaRows = findings.map(f => ({
      analysis_id: analysisId,
      module_id: f.module_id,
      rule_id: f.rule_id,
      page_number: f.page_number,
      severity: f.severity,
      message: f.message,
      evidence: f.evidence,
    }));

    if (qaRows.length > 0) {
      const { error: upsertErr } = await sb
        .from("qa_results")
        .upsert(qaRows, { onConflict: "analysis_id,module_id,rule_id,page_number" });

      if (upsertErr) {
        logError("QA runner: upsert failed", logContext, upsertErr);
        endTimer(request_id, false, upsertErr);
        return json({ error: "Database upsert failed", details: upsertErr.message }, { status: 500 });
      }
    }

    endTimer(request_id, true);

    return json({
      success: true,
      module_id: titleBlockValidator.id,
      module_label: titleBlockValidator.label,
      analysis_id: analysisId,
      findings_count: findings.length,
      findings,
    });

  } catch (error: any) {
    logError("QA runner failed", logContext, error);
    endTimer(request_id, false, error);
    return json({ 
      error: "QA processing failed", 
      message: String(error?.message ?? error), 
      request_id 
    }, { status: 500 });
  }
});
