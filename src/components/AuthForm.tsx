"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Lock, Mail, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? "Authentication failed. Please try signing in again." : null,
  );

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email address and password (at least 6 characters).");
      return;
    }
    setConfirmOpen(true);
  }

  async function executeSignIn() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        setConfirmOpen(false);
        return;
      }
      const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.push(safeNext);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#FAF9F5] text-[#1F1E1C] px-4 py-8">
      <div />

      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="rounded-3xl border border-[#E6E2D8] bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2.5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E6E2D8] bg-[#FAF9F5] p-1 shadow-2xs overflow-hidden">
              <Image
                src="/logo.png"
                alt="Accomplish AI"
                width={52}
                height={52}
                className="h-full w-full object-contain rounded-xl"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1F1E1C]">Accomplish AI</h1>
              <p className="mt-1 text-sm text-[#6B665E]">
                Turn daily internship notes into your official weekly .docx report.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A847A]" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="intern@company.com"
                  className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] pl-10 pr-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A847A]" />
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] pl-10 pr-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#D97757] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C86343] disabled:opacity-60 transition cursor-pointer shadow-2xs"
            >
              <span>{loading ? "Signing in..." : "Sign in"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="rounded-xl bg-[#F4F2EA] border border-[#E6E2D8] px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#57544E]">
            <ShieldCheck className="h-4 w-4 text-[#D97757] shrink-0" />
            <span>Intern accounts are created exclusively by your team administrator.</span>
          </div>
        </div>
      </div>

      <footer className="pt-6 text-center text-xs text-[#6B665E]">
        Created by <span className="font-semibold text-[#1F1E1C]">Mike Ryno Santiago</span> — DNX Intern
      </footer>

      {/* Sign-In Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1E1C]/45 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#E6E2D8] bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FDF3EF] text-[#D97757] border border-[#F0D5C9]">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[#1F1E1C]">Confirm Sign In</h2>
                  <p className="text-xs text-[#6B665E]">Continue to Accomplish AI</p>
                </div>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg p-1 text-[#6B665E] hover:bg-[#F4F2EA] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#FAF9F5] border border-[#E6E2D8] px-3.5 py-2.5 text-xs text-[#4A463F]">
              Signing in as <strong className="text-[#1F1E1C] break-all">{email.trim()}</strong>. Your report drafts and
              saved history sync securely across devices.
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-[#DDD7CB] bg-white px-3.5 py-2 text-xs font-medium text-[#4A463F] hover:bg-[#F4F2EA] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void executeSignIn()}
                className="rounded-xl bg-[#D97757] px-4 py-2 text-xs font-semibold text-white hover:bg-[#C86343] disabled:opacity-60 cursor-pointer"
              >
                {loading ? "Signing in..." : "Confirm Sign In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
