import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "*",
};

const PDFCO_API_KEY = Deno.env.get("PDFCO_API_KEY") || Deno.env.get("PDFCO_APIKEY") || "";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const nowIso = new Date().toISOString();
  let url: string | undefined;
  let page = 1;
  
  try {
    const body = await req.json();
    url = body?.url;
    page = Number(body?.page ?? 1) || 1;
  } catch (_e) {
    // no body is fine; we'll use a public sample
  }

  const testUrl = url ?? "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

  if (!PDFCO_API_KEY) {
    return json({
      ok: false,
      at: nowIso,
      reason: "missing_api_key",
      message: "PDFCO_API_KEY not set in environment. Set it in Supabase (Secrets) and redeploy.",
    }, { status: 500 });
  }

  try {
    const endpoint = "https://api.pdf.co/v1/pdf/convert/to/text";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PDFCO_API_KEY,
      },
      body: JSON.stringify({
        url: testUrl,
        pages: String(page), // e.g. "1"
      }),
    });

    const rawText = await res.text();
    let payload: Record<string, unknown> = {};
    
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { raw: rawText };
    }

    const merged = String(
      (payload as any)?.text ??
      (payload as any)?.body ??  
      (payload as any)?.message ??
      "",
    );
    const sample = merged.slice(0, 400);

    return json({
      ok: res.ok,
      status: res.status,
      endpoint: "pdf/convert/to/text",
      at: nowIso,
      request: { page, url: testUrl },
      sample, // first ~400 chars (if present)
    }, { status: res.ok ? 200 : 502 });
    
  } catch (error) {
    return json({
      ok: false,
      at: nowIso,
      endpoint: "pdf/convert/to/text",
      error: String(error?.message ?? error),
    }, { status: 500 });
  }
});
