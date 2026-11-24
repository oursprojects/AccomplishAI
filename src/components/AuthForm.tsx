"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck2,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from "lucide-react";
import { ReportPenIcon } from "@/components/icons/AccomplishIcons";
import { AnimatedFileTextIcon, AnimatedShieldIcon } from "@/components/icons/AnimatedIcons";
import { BlurFade } from "@/components/magicui/blur-fade";
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
      <div className="relative z-10 mx-auto w-full max-w-5xl flex items-center justify-between pb-4">
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
        <span className="text-xs text-[#141413]/55">Weekly Accomplishment Report System</span>
      </div>

      <BlurFade className="relative z-10 mx-auto w-full max-w-5xl my-8">
        <div className="swiss-frame border border-[#E2E2DC] bg-white/85 grid grid-cols-1 lg:grid-cols-12">
          <span className="swiss-corner swiss-corner-tl" aria-hidden="true" />
          <span className="swiss-corner swiss-corner-tr" aria-hidden="true" />
          <span className="swiss-corner swiss-corner-bl" aria-hidden="true" />
          <span className="swiss-corner swiss-corner-br" aria-hidden="true" />

          {/* Editorial Overview */}
          <div className="lg:col-span-7 p-6 sm:p-10 lg:border-r border-b lg:border-b-0 border-[#E2E2DC] flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-light tracking-tight text-[#141413] text-balance leading-[1.12]">
                Build official weekly internship reports with precision.
              </h1>
              <p className="text-sm sm:text-base text-[#141413]/70 text-pretty leading-relaxed max-w-[60ch]">
                Convert rough daily voice or text notes in English or Tagalog into formatted, print-ready{" "}
                <span className="font-medium text-[#141413]">8.5&quot; × 11&quot;</span> Word reports, inspect
                cumulative OJT hours, and export clean PDFs and Excel summaries.
              </p>
            </div>

            <div className="space-y-6">
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <AnimatedFileTextIcon className="size-4 text-[#1D4ED8]" />
                  <p className="text-xs font-medium text-[#141413]">Live .docx Preview</p>
                  <p className="text-xs text-[#141413]/60 text-pretty leading-relaxed">
                    1-page layout preview with editable headings and verified signatories.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <ReportPenIcon className="size-4 text-[#1D4ED8]" />
                  <p className="text-xs font-medium text-[#141413]">Report &amp; Workspace AI</p>
                  <p className="text-xs text-[#141413]/60 text-pretty leading-relaxed">
                    Structures daily logs into formal past-tense tasks, charts, and diagrams.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <CalendarCheck2 className="size-4 text-[#1D4ED8]" />
                  <p className="text-xs font-medium text-[#141413]">Holiday-Aware Schedule</p>
                  <p className="text-xs text-[#141413]/60 text-pretty leading-relaxed">
                    Tracks required OJT hours and shifts active weeks around holiday breaks.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sign-in Column */}
          <div className="lg:col-span-5 p-6 sm:p-10 bg-white flex flex-col justify-center space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-xl font-medium tracking-tight text-[#141413] text-balance">Sign in to workspace</h2>
              <p className="text-xs sm:text-sm text-[#141413]/60 text-pretty">
                Enter your assigned intern or admin credentials to continue.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-[#141413]/70 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#141413]/35" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="intern@company.com"
                    className="pl-9 h-10 bg-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-medium text-[#141413]/70 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#141413]/35" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pl-9 pr-10 h-10 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141413]/40 hover:text-[#141413] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="accent" size="lg" disabled={loading} className="w-full">
                <span>{loading ? "Signing in…" : "Sign in to workspace"}</span>
                <ArrowRight className="size-4" />
              </Button>
            </form>

            <Alert className="bg-[#F1F1EE]">
              <AnimatedShieldIcon className="size-4 text-[#1D4ED8] shrink-0" />
              <AlertDescription className="text-[#141413]/75">
                Accounts are provisioned by your team administrator.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </BlurFade>

      <footer className="relative z-10 mx-auto w-full max-w-5xl border-t border-[#E2E2DC] pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#141413]/55">
        <span>
          Created by <span className="font-medium text-[#141413]">Mike Ryno Santiago</span> — DNX Intern
        </span>
        <span className="font-mono text-[11px]">Accomplish AI · 2026</span>
      </footer>
    </div>
  );
}
