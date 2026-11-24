import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — safe to ignore, proxy.ts refreshes sessions.
        }
      },
    },
  });
});

/** Returns the signed-in user or null (validated against Supabase Auth). */
export const getUser = cache(async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export interface FastSessionUser {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
}

/**
 * Fast session reader for Server Component page renders: verifies JWT claims locally
 * (using cached JWKS, avoiding an extra ~300ms /auth/v1/user network roundtrip per tab switch).
 */
export const getFastUser = cache(async function getFastUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: FastSessionUser | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    return { supabase, user: null };
  }
  return {
    supabase,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      user_metadata:
        claims.user_metadata && typeof claims.user_metadata === "object"
          ? (claims.user_metadata as Record<string, unknown>)
          : {},
    },
  };
});
