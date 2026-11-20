import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

/** Builds a JSON error response with consistent structure. */
export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
  headers?: HeadersInit,
) {
  return NextResponse.json({ error, ...extra }, { status, ...(headers ? { headers } : {}) });
}

/** Parses and validates a JSON request body cleanly without throwing on malformed JSON. */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  invalidMessage = "Invalid request payload.",
): Promise<{ data: T; response?: never } | { data?: never; response: NextResponse }> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: jsonError(400, parsed.error.issues[0]?.message ?? invalidMessage),
    };
  }
  return { data: parsed.data };
}

/** Logs raw server/DB failures privately and returns a sanitized message to callers. */
export function safeServerError(scope: string, err: unknown, fallbackMessage: string, status = 500) {
  console.error(`[${scope}]`, err);
  return jsonError(status, fallbackMessage);
}

/** Validates internal redirect targets against open-redirect / protocol-relative tricks. */
export function sanitizeRedirectPath(raw?: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  return trimmed;
}
