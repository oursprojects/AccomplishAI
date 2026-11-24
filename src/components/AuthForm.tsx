"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { AnimatedShieldIcon } from "@/components/icons/AnimatedIcons";
import { BlurFade } from "@/components/magicui/blur-fade";
import { BorderBeam } from "@/components/magicui/border-beam";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? "Authentication failed. Please try signing in again." : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email address and password (at least 6 characters).");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: authData, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        return;
      }

      // If admin seeded optional intern profile defaults in user_metadata on creation, ensure profile row exists cleanly
      const signedUser = authData.user;
      if (signedUser) {
        const meta = (signedUser.user_metadata ?? {}) as Record<string, unknown>;
        const hasSeededDefaults =
          typeof meta.name_last_first === "string" ||
          typeof meta.name_first_last === "string" ||
          typeof meta.office === "string" ||
          typeof meta.default_daily_hours === "number" ||
          typeof meta.target_ojt_hours === "number" ||
          typeof meta.internship_start_date === "string";
        if (hasSeededDefaults) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", signedUser.id)
            .maybeSingle();
          if (!existingProfile) {
            try {
              await supabase.from("profiles").upsert(
                {
                  id: signedUser.id,
                  name_last_first: typeof meta.name_last_first === "string" ? meta.name_last_first : "",
                  name_first_last: typeof meta.name_first_last === "string" ? meta.name_first_last : "",
                  office: typeof meta.office === "string" && meta.office ? meta.office : "DNX",
                  default_verifier: typeof meta.default_verifier === "string" ? meta.default_verifier : "",
                  default_daily_hours:
                    typeof meta.default_daily_hours === "number" ? meta.default_daily_hours : 8,
                  target_ojt_hours:
                    typeof meta.target_ojt_hours === "number" ? meta.target_ojt_hours : 486,
                  internship_start_date:
                    typeof meta.internship_start_date === "string" ? meta.internship_start_date : null,
                },
                { onConflict: "id" },
              );
            } catch {
              // Non-fatal fallback; profile page still allows saving later
            }
          }
        }
      }

      const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
      router.push(safeNext);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh flex flex-col justify-between bg-[#F8F8F6] text-[#141413] px-4 py-6 sm:px-8 sm:py-10 overflow-x-hidden">
      <DotPattern className="opacity-45" />

      <header className="relative z-10 mx-auto w-full max-w-5xl flex items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Accomplish AI"
            width={36}
            height={36}
            className="size-9 object-contain rounded-lg"
            priority
          />
          <span className="text-sm font-medium tracking-tight text-[#141413]">Accomplish AI</span>
        </div>
        <span className="text-xs text-[#52524E]">Weekly Accomplishment Report System</span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-md my-8">
        <BlurFade>
          <div className="swiss-frame relative rounded-xl border border-[#E2E2DC] bg-white p-6 sm:p-8 shadow-xs">
            <BorderBeam duration={9} />
            <span className="swiss-corner swiss-corner-tl" aria-hidden="true" />
            <span className="swiss-corner swiss-corner-tr" aria-hidden="true" />
            <span className="swiss-corner swiss-corner-bl" aria-hidden="true" />
            <span className="swiss-corner swiss-corner-br" aria-hidden="true" />

            <div className="space-y-6">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-light tracking-tight text-[#141413] text-balance">
                  Sign in to workspace
                </h1>
                <p className="text-sm text-[#52524E] text-pretty leading-relaxed">
                  Enter your assigned intern or admin credentials to continue.
                </p>
              </div>

              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-medium text-[#141413]">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#52524E]" />
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      aria-invalid={Boolean(error)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="intern@company.com"
                      className="pl-9 h-11 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-medium text-[#141413]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#52524E]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      aria-invalid={Boolean(error)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pl-9 pr-12 h-11 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#52524E] hover:text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/45 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" variant="accent" size="lg" disabled={loading} className="w-full min-h-[44px]">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in to workspace</span>
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>

              <Separator />

              <Alert className="bg-[#F8F8F6] border-[#E2E2DC]">
                <AnimatedShieldIcon className="size-4 text-[#1D4ED8] shrink-0" />
                <AlertDescription className="text-[#52524E] opacity-100">
                  Accounts are provisioned by your team administrator.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </BlurFade>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl border-t border-[#E2E2DC] pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#52524E]">
        <span>
          Created by <span className="font-medium text-[#141413]">Mike Ryno Santiago</span> — DNX Intern
        </span>
        <span className="font-mono text-[11px]">Accomplish AI · 2026</span>
      </footer>
    </div>
  );
}
