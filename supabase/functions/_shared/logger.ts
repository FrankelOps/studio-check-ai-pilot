// supabase/functions/_shared/logger.ts
// Schema-correct logger for check_execution_logs.
// Compatible with Cursor's calls: generateRequestId(), startTimer(ctx), endTimer(request_id, success, error?)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Level = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  request_id: string;
  function_name: string;
  project_id?: string;   // uuid (string ok)
  user_id?: string;      // uuid (string ok)
  analysis_id?: string;  // uuid (string ok)
  file_id?: string;      // NOT a column in the table; we store in data JSON
  data?: unknown;        // extra metadata (kept small)
}

// Service-role client: bypasses RLS to write logs
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// In-memory timers by request
const timers = new Map<string, { t0: number; ctx: LogContext }>();

export function generateRequestId(): string {
  return crypto.randomUUID();
}

// Internal: safe, non-throwing insert that only sends allowed columns
function write(row: {
  function_name: string;
  request_id: string;
  level: Level;
  message: string;
  project_id?: string | null;
  user_id?: string | null;
  analysis_id?: string | null;
  duration_ms?: number | null;
  success?: boolean | null;
  data?: unknown | null; // JSONB
}): void {
  supabase
    .from("check_execution_logs")
    .insert(row)
    .single()
    .then(({ error }) => {
      if (error) console.warn("[logger] insert failed:", error.message);
    })
    .catch((e) => console.warn("[logger] unexpected:", e));
}

/**
 * Start a timer and log a "start" row.
 * Cursor calls: startTimer(logContext)
 */
export function startTimer(context: LogContext): string {
  const requestId = context.request_id;

  timers.set(requestId, { t0: Date.now(), ctx: context });

  // Put file_id and any extra into data JSON (since file_id is not a column)
  const data =
    context.data ?? (context.file_id ? { file_id: context.file_id } : null);

  write({
    function_name: context.function_name,
    request_id: requestId,
    level: "info",
    message: "start",
    project_id: context.project_id ?? null,
    user_id: context.user_id ?? null,
    analysis_id: context.analysis_id ?? null,
    duration_ms: null,
    success: null,
    data,
  });

  return requestId;
}

/**
 * End timer and log "completed" (success=true) or "failed" (success=false).
 * Cursor calls: endTimer(request_id, success, error?)
 */
export function endTimer(
  requestId: string,
  success: boolean,
  error?: unknown
): void {
  const entry = timers.get(requestId);
  if (!entry) {
    console.warn(`[logger] no timer for request_id=${requestId}`);
    return;
  }

  const duration = Date.now() - entry.t0;
  const base = entry.ctx;

  const level: Level = success ? "info" : "error";
  const message = success ? "completed" : "failed";

  const combinedData =
    success
      ? (base.data ?? (base.file_id ? { file_id: base.file_id } : null))
      : mergeError(base, error);

  write({
    function_name: base.function_name,
    request_id: requestId,
    level,
    message,
    project_id: base.project_id ?? null,
    user_id: base.user_id ?? null,
    analysis_id: base.analysis_id ?? null,
    duration_ms: Math.max(0, Math.round(duration)),
    success,
    data: combinedData,
  });

  timers.delete(requestId);
}

// Optional helpers (not required by Cursor's current integration)
export function logInfo(message: string, ctx: LogContext & Record<string, any>): void {
  write({
    function_name: ctx.function_name,
    request_id: ctx.request_id,
    level: "info",
    message,
    project_id: ctx.project_id ?? null,
    user_id: ctx.user_id ?? null,
    analysis_id: ctx.analysis_id ?? null,
    duration_ms: null,
    success: null,
    data: ctx.data ?? (ctx.file_id ? { file_id: ctx.file_id } : null),
  });
}

export function logError(message: string, ctx: LogContext & Record<string, any>, error?: unknown): void {
  write({
    function_name: ctx.function_name,
    request_id: ctx.request_id,
    level: "error",
    message,
    project_id: ctx.project_id ?? null,
    user_id: ctx.user_id ?? null,
    analysis_id: ctx.analysis_id ?? null,
    duration_ms: null,
    success: false,
    data: mergeError(ctx, error),
  });
}

// ---- utility ---------------------------------------------------------------

function mergeError(ctx: LogContext, error?: unknown) {
  const base = ctx.data ?? (ctx.file_id ? { file_id: ctx.file_id } : {});
  const err = serializeError(error);
  if (!err) return base || null;
  return { ...(typeof base === "object" ? base : { base }), error: err };
}

function serializeError(err: unknown) {
  if (!err) return null;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  try {
    return JSON.parse(JSON.stringify(err));
  } catch {
    return { error: String(err) };
  }
}

