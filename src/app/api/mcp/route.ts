import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { checkBurstRateLimit, getQuotaAndAiSettings } from "@/lib/admin";
import { publicEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { createAccomplishMcpServer } from "@/lib/mcp/accomplish-mcp-server";

function isSameOriginCookieRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function resolveMcpAuth(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const tokenClient = createSupabaseClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const {
        data: { user },
      } = await tokenClient.auth.getUser(token);
      if (user) return { supabase: tokenClient, user, usedCookies: false };
    }
    return null;
  }

  if (!isSameOriginCookieRequest(request)) {
    return null;
  }

  const { supabase, user } = await getUser();
  return user ? { supabase, user, usedCookies: true } : null;
}

async function handleMcpRequest(request: Request) {
  const auth = await resolveMcpAuth(request);
  if (!auth) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized — sign in to Accomplish AI or pass a valid Supabase Bearer JWT.",
        },
        id: null,
      },
      { status: 401 },
    );
  }

  const { quota, aiSettings } = await getQuotaAndAiSettings(auth.supabase, auth.user.id, auth.user.email);
  if (quota.isBlocked) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32003,
          message: "Account access is currently paused by the administrator.",
        },
        id: null,
      },
      { status: 403 },
    );
  }

  if (request.method === "POST") {
    const burst = await checkBurstRateLimit(auth.supabase, auth.user.id, quota.isAdmin, aiSettings.globalRpmLimit);
    if (!burst.allowed) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32005,
            message: `Rate limit exceeded (${burst.count}/${burst.limit} RPM). Retry in ${burst.retryAfterSeconds}s.`,
          },
          id: null,
        },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } },
      );
    }
  }

  const server = createAccomplishMcpServer({
    supabase: auth.supabase,
    user: auth.user,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await Promise.allSettled([transport.close(), server.close()]);
  }
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
