"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck2,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { AccomplishCheckIcon, ReportPenIcon } from "@/components/icons/AccomplishIcons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <div className="relative min-h-dvh flex flex-col justify-between bg-[#FAF9F5] text-[#1F1E1C] px-4 py-6 sm:px-6 sm:py-10 overflow-x-hidden">
      {/* Generated Editorial WebP Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-35"
        style={{ backgroundImage: "url('/bg-accomplish.webp')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[#FAF9F5]/82"
      />

      <div className="relative z-10" />

      <div className="relative z-10 mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center my-auto py-4">
        {/* System Overview / Purpose Showcase */}
        <div className="lg:col-span-6 space-y-5 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F0D5C9] bg-[#FDF3EF]/90 px-3 py-1 text-xs font-semibold text-[#C86343] shadow-2xs">
            <AccomplishCheckIcon className="h-3.5 w-3.5" />
            <span>Weekly Accomplishment Report System</span>
          </div>

          <div className="space-y-2.5">
            <h1 className="text-3xl sm:text-4xl font-semibold text-[#1F1E1C] text-balance leading-[1.15]">
              Build official weekly internship reports in minutes.
            </h1>
            <p className="text-sm sm:text-base text-[#57544E] text-pretty leading-relaxed max-w-xl mx-auto lg:mx-0">
              Accomplish AI is built specifically for creating your{" "}
              <strong className="text-[#1F1E1C]">Weekly Accomplishment Reports</strong>. Chat or paste rough daily notes
              in English or Tagalog, inspect the strict <strong className="text-[#1F1E1C]">8.5&quot; × 11&quot;</strong>{" "}
              live document preview, and download your ready-to-sign Word file.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-1">
            <div className="rounded-2xl border border-[#E6E2D8] bg-white/85 backdrop-blur-sm p-3.5 shadow-2xs">
              <FileText className="h-4 w-4 text-[#D97757] mb-1.5" />
              <p className="text-xs font-semibold text-[#1F1E1C]">Live .docx Preview</p>
              <p className="mt-0.5 text-[11px] text-[#6B665E] leading-snug">
                Instant 1-page preview with customizable headings and signatories.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E6E2D8] bg-white/85 backdrop-blur-sm p-3.5 shadow-2xs">
              <ReportPenIcon className="h-4 w-4 text-[#D97757] mb-1.5" />
              <p className="text-xs font-semibold text-[#1F1E1C]">AI Task Assistant</p>
              <p className="mt-0.5 text-[11px] text-[#6B665E] leading-snug">
                Converts raw daily logs into clear, formal past-tense accomplishments.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E6E2D8] bg-white/85 backdrop-blur-sm p-3.5 shadow-2xs">
              <CalendarCheck2 className="h-4 w-4 text-[#D97757] mb-1.5" />
              <p className="text-xs font-semibold text-[#1F1E1C]">Holiday-Aware Calendar</p>
              <p className="mt-0.5 text-[11px] text-[#6B665E] leading-snug">
                Tracks OJT hours and skips holiday breaks seamlessly into next month.
              </p>
            </div>
          </div>
        </div>

        {/* Sign-in Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <Card className="rounded-3xl border-[#E5E2D9] bg-white/95 backdrop-blur-md p-6 sm:p-8 shadow-md space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="Accomplish AI"
                  width={88}
                  height={88}
                  className="size-20 sm:size-24 object-contain rounded-2xl"
                  priority
                />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#1F1E1C]">Accomplish AI</h2>
                <p className="mt-1 text-xs sm:text-sm text-[#6B665E]">
                  Sign in to access your Weekly Accomplishment Report workspace.
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A847A]" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="intern@company.com"
                    className="pl-10 py-2.5 h-10 bg-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A847A]" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pl-10 pr-10 py-2.5 h-10 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A847A] hover:text-[#1F1E1C] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="accent" size="lg" disabled={loading} className="w-full">
                <span>{loading ? "Signing in..." : "Sign in to Workspace"}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="rounded-xl bg-[#F4F2EA] border border-[#E6E2D8] px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#57544E]">
              <ShieldCheck className="h-4 w-4 text-[#D97757] shrink-0" />
              <span>Intern accounts are created exclusively by your team administrator.</span>
            </div>
          </Card>
        </div>
      </div>

      <footer className="relative z-10 pt-6 text-center text-xs text-[#57544E]">
        Created by <span className="font-semibold text-[#1F1E1C]">Mike Ryno Santiago</span> — DNX Intern
      </footer>
    </div>
  );
}
