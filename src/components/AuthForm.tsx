"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
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
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        return;
      }
      const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
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
        <Card className="rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="Accomplish AI"
                width={96}
                height={96}
                className="h-24 w-24 object-contain rounded-2xl"
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1.5">
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
                  className="pl-10 py-2.5 h-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1.5">
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
                  className="pl-10 pr-10 py-2.5 h-10"
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
              <span>{loading ? "Signing in..." : "Sign in"}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="rounded-xl bg-[#F4F2EA] border border-[#E6E2D8] px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#57544E]">
            <ShieldCheck className="h-4 w-4 text-[#D97757] shrink-0" />
            <span>Intern accounts are created exclusively by your team administrator.</span>
          </div>
        </Card>
      </div>

      <footer className="pt-6 text-center text-xs text-[#6B665E]">
        Created by <span className="font-semibold text-[#1F1E1C]">Mike Ryno Santiago</span> — DNX Intern
      </footer>
    </div>
  );
}
