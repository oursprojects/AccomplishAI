"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { AnimatedCheckIcon, AnimatedShieldIcon } from "@/components/icons/AnimatedIcons";
import { BlurFade } from "@/components/magicui/blur-fade";
import { BorderBeam } from "@/components/magicui/border-beam";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
    <div className="relative min-h-dvh w-full flex flex-col justify-between bg-[#F8F8F6] text-[#141413] px-4 py-2.5 sm:px-6 sm:py-4 overflow-x-hidden">
      <DotPattern className="opacity-45" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-gradient-to-b from-[#EFF4FF]/70 to-transparent"
      />

      <header className="relative z-10 mx-auto w-full max-w-4xl flex items-center justify-between gap-3 py-0.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Accomplish AI"
            width={32}
            height={32}
            className="size-8 object-contain rounded-lg"
            priority
          />
          <span className="text-sm font-semibold tracking-tight text-[#141413]">Accomplish AI</span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] tracking-wide text-[#52524E] bg-white/80">
          OJT REPORT WORKSPACE
        </Badge>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center py-1.5 sm:py-2">
        <BlurFade className="w-full max-w-[420px] lg:max-w-4xl">
          <div className="swiss-frame relative rounded-2xl border border-[#E2E2DC] bg-white shadow-sm grid grid-cols-1 lg:grid-cols-12">
            <BorderBeam duration={10} />
            <span className="swiss-corner swiss-corner-tl" aria-hidden="true" />
            <span className="swiss-corner swiss-corner-tr" aria-hidden="true" />
            <span className="swiss-corner swiss-corner-bl" aria-hidden="true" />
            <span className="swiss-corner swiss-corner-br" aria-hidden="true" />

            {/* Architectural Document Specimen Column (desktop only so mobile & short screens never scroll) */}
            <div className="hidden lg:flex lg:col-span-6 relative overflow-hidden rounded-l-2xl border-r border-[#E2E2DC] bg-[#F1F1EE] p-6 flex-col justify-between">
              <Image
                src="/bg-accomplish.webp"
                alt=""
                fill
                sizes="(min-width: 1024px) 440px, 0px"
                className="object-cover opacity-35 mix-blend-multiply pointer-events-none"
                priority
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/75 via-[#EFF4FF]/55 to-[#F1F1EE]/85"
              />

              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C7D7FE] bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#1E40AF]">
                  <span className="size-1.5 rounded-full bg-[#1D4ED8]" />
                  <span>Workspace Portal</span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#52524E]">
                  8.5&quot; × 11&quot;
                </span>
              </div>

              {/* Miniature architectural report sheet */}
              <div className="relative z-10 my-4 rounded-xl border border-[#D8D8D0] bg-white/95 p-4 shadow-sm backdrop-blur-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#E2E2DC] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-[#EFF4FF] border border-[#C7D7FE] text-[#1D4ED8]">
                      <FileCheck2 className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold tracking-tight text-[#141413]">
                        Weekly Accomplishment Sheet
                      </p>
                      <p className="font-mono text-[10px] text-[#52524E]">MON – FRI · VERIFIED</p>
                    </div>
                  </div>
                  <Badge variant="success" className="text-[10px] px-2 py-0.5">
                    <AnimatedCheckIcon className="size-3" />
                    <span>Ready</span>
                  </Badge>
                </div>

                {/* Day-row wireframe bars */}
                <div className="space-y-2">
                  {[
                    { day: "MON", w: "w-4/5", hrs: "8h" },
                    { day: "TUE", w: "w-11/12", hrs: "8h" },
                    { day: "WED", w: "w-3/4", hrs: "8h" },
                    { day: "THU", w: "w-5/6", hrs: "8h" },
                    { day: "FRI", w: "w-4/5", hrs: "8h" },
                  ].map((row) => (
                    <div key={row.day} className="flex items-center gap-2.5">
                      <span className="w-7 font-mono text-[10px] font-medium text-[#52524E]">{row.day}</span>
                      <div className="flex-1 h-2 rounded-full bg-[#F1F1EE] overflow-hidden">
                        <div className={`h-full rounded-full bg-[#1D4ED8]/80 ${row.w}`} />
                      </div>
                      <span className="w-6 text-right font-mono text-[10px] text-[#141413] tabular-nums">
                        {row.hrs}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-[#E2E2DC] pt-2.5 text-[10px] font-mono text-[#52524E]">
                  <span>EXPORT: DOCX · PDF · XLSX</span>
                  <span className="font-semibold text-[#1D4ED8]">40.0 HRS</span>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between text-[11px] text-[#52524E]">
                <span>Encrypted Supabase Session</span>
                <span className="font-mono text-[10px]">MANILA · UTC+8</span>
              </div>
            </div>

            {/* Sign-in Form Column */}
            <div className="lg:col-span-6 p-5 sm:p-6 lg:p-7 flex flex-col justify-center space-y-4">
              {/* Compact mobile accent banner */}
              <div className="flex lg:hidden items-center justify-between rounded-lg border border-[#C7D7FE] bg-[#EFF4FF]/70 px-3 py-1.5 text-[11px] font-medium text-[#1E40AF]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[#1D4ED8]" />
                  <span>Workspace Portal</span>
                </span>
                <span className="font-mono text-[10px]">DOCX · PDF · XLSX</span>
              </div>

              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-light tracking-tight text-[#141413] text-balance">
                  Sign in to workspace
                </h1>
                <p className="text-xs sm:text-sm text-[#52524E] text-pretty">
                  Enter your assigned intern or admin credentials.
                </p>
              </div>

              {error && (
                <Alert variant="destructive" role="alert" className="py-2.5">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1">
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
                      className="pl-9 h-11 bg-[#F8F8F6] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
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
                      className="pl-9 pr-12 h-11 bg-[#F8F8F6] focus:bg-white"
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

              <div className="flex items-center gap-2 text-xs text-[#52524E]">
                <AnimatedShieldIcon className="size-4 text-[#1D4ED8] shrink-0" />
                <span>Accounts are provisioned by your team administrator.</span>
              </div>
            </div>
          </div>
        </BlurFade>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-4xl border-t border-[#E2E2DC] pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-[#52524E] shrink-0">
        <span>
          Created by <span className="font-medium text-[#141413]">Mike Ryno Santiago</span> — DNX Intern
        </span>
        <span className="font-mono text-[10px] sm:text-[11px]">Accomplish AI · 2026</span>
      </footer>
    </div>
  );
}
