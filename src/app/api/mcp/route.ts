import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { publicEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { createAccomplishMcpServer } from "@/lib/mcp/accomplish-mcp-server";

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
      if (user) return { supabase: tokenClient, user };
    }
  }

  const { supabase, user } = await getUser();
  return user ? { supabase, user } : null;
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
