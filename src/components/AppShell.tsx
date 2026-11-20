"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileCheck2,
  FilePlus2,
  History,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QuotaStatus } from "@/lib/admin";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_NAV: NavItem[] = [
  { href: "/", label: "Report Chat", icon: MessageSquareText },
  { href: "/history", label: "History", icon: History },
  { href: "/template", label: "Template", icon: FileCheck2 },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function AllowancePill({ quota }: { quota?: QuotaStatus }) {
  if (!quota) return null;

  const badgeTone = quota.isAdmin
    ? "bg-[#FDF3EF] text-[#C86343] border-[#F0D5C9]"
    : quota.isBlocked || quota.remaining === 0
      ? "bg-red-50 text-red-700 border-red-200"
      : quota.remaining <= 3
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-white text-[#1F1E1C] border-[#E5E2D9]";

  return (
    <div
      title="Remaining AI prompts today (resets 12:00 AM Manila time)"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-2xs ${badgeTone}`}
    >
      <Sparkles className="h-3 w-3 text-[#D97757] shrink-0" />
      {quota.isAdmin ? (
        <span>Admin · Unlimited AI</span>
      ) : quota.isBlocked ? (
        <span>AI Paused</span>
      ) : (
        <span>
          <strong>{quota.remaining}</strong>/{quota.dailyLimit} prompts left
        </span>
      )}
    </div>
  );
}

export function AppShell({
  userEmail,
  quota,
  children,
}: {
  userEmail: string;
  quota?: QuotaStatus;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = quota?.isAdmin ?? false;
  const navItems: NavItem[] = isAdmin
    ? [...BASE_NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : BASE_NAV;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const currentLabel = navItems.find((i) => i.href === pathname)?.label ?? "Accomplish AI";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5] text-[#1F1E1C]">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[#E5E2D9] bg-[#FAF9F5]/95 backdrop-blur-md px-3.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E5E2D9] bg-white text-[#1F1E1C] hover:bg-[#F4F2EA] cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo.png"
              alt="Accomplish AI"
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-contain shrink-0"
            />
            <span className="text-sm font-semibold tracking-tight truncate">{currentLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AllowancePill quota={quota} />
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            title="Sign out"
            className="inline-flex items-center justify-center rounded-xl border border-[#E5E2D9] bg-white p-2 text-xs font-medium text-[#57544E] hover:bg-[#F4F2EA] disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#1F1E1C]/35 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[82vw] flex-col justify-between border-r border-[#E5E2D9] bg-[#F4F2EA] p-4 shadow-xl">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                  <Image
                    src="/logo.png"
                    alt="Accomplish AI"
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-xl object-contain shrink-0"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-[#1F1E1C]">Accomplish AI</span>
                    <span className="block text-[11px] text-[#66645E]">Weekly Report Assistant</span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#66645E] hover:bg-[#EAE7DD] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <Link
                href="/?new=1"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#D97757] px-3 py-2 text-xs font-semibold text-white hover:bg-[#C86343] transition shadow-2xs"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>New Report</span>
              </Link>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? "bg-white text-[#1F1E1C] shadow-2xs border border-[#E5E2D9]"
                          : "text-[#57544E] hover:bg-[#EAE7DD]/70 hover:text-[#1F1E1C]"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-[#C96442]" : "text-[#7A776F]"}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-[#E5E2D9] pt-3 space-y-2.5">
              <div className="rounded-xl bg-white/80 border border-[#E5E2D9] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#1F1E1C] truncate">{userEmail}</span>
                  {isAdmin && (
                    <span className="shrink-0 rounded-full bg-[#D97757]/15 px-2 py-0.5 text-[10px] font-semibold text-[#C96442]">
                      Admin
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => {
                  setMobileOpen(false);
                  void handleSignOut();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#E5E2D9] bg-white px-3 py-2 text-xs font-medium text-[#57544E] hover:bg-[#EAE7DD]/60 disabled:opacity-50 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{signingOut ? "Signing out..." : "Sign out"}</span>
              </button>
              <p className="text-center text-[10px] text-[#7A746B]">
                Created by Mike Ryno Santiago — DNX Intern
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sticky sidebar */}
      <aside
        className={`hidden md:flex sticky top-0 h-screen shrink-0 flex-col justify-between border-r border-[#E5E2D9] bg-[#F4F2EA] transition-all duration-200 ${
          collapsed ? "w-[76px] px-2.5 py-4" : "w-60 px-3.5 py-4"
        }`}
      >
        <div className="space-y-4">
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-0.5"}`}>
            {!collapsed && (
              <Link href="/" className="flex items-center gap-2.5 min-w-0">
                <Image
                  src="/logo.png"
                  alt="Accomplish AI"
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-xl object-contain"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-semibold tracking-tight text-[#1F1E1C] truncate">
                    Accomplish AI
                  </span>
                  <span className="block text-[10px] text-[#66645E] truncate">Weekly Report</span>
                </div>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#66645E] hover:bg-[#EAE7DD] hover:text-[#1F1E1C] transition cursor-pointer"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <Link
            href="/?new=1"
            title="Start a separate blank report"
            className={`flex items-center justify-center ${
              collapsed ? "px-2 py-2" : "gap-2 px-3 py-2"
            } rounded-xl bg-[#D97757] text-xs font-semibold text-white hover:bg-[#C86343] transition shadow-2xs`}
          >
            <FilePlus2 className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>New Report</span>}
          </Link>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center ${
                    collapsed ? "justify-center px-2" : "gap-3 px-3"
                  } rounded-xl py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-white text-[#1F1E1C] shadow-2xs border border-[#E5E2D9]"
                      : "text-[#57544E] hover:bg-[#EAE7DD]/80 hover:text-[#1F1E1C]"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#C96442]" : "text-[#7A776F]"}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#E5E2D9] pt-3 space-y-2">
          {!collapsed && (
            <div className="rounded-xl bg-white/80 border border-[#E5E2D9] px-3 py-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-medium text-[#1F1E1C] truncate">{userEmail}</span>
                {isAdmin && (
                  <span className="shrink-0 rounded-full bg-[#D97757]/15 px-2 py-0.5 text-[10px] font-semibold text-[#C96442]">
                    Admin
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            title="Sign out"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "justify-center gap-2 px-3"
            } rounded-xl border border-[#E5E2D9] bg-white py-2 text-xs font-medium text-[#57544E] hover:bg-[#EAE7DD]/60 disabled:opacity-50 transition cursor-pointer`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
          </button>

          {!collapsed && (
            <p className="pt-1 text-center text-[10px] leading-snug text-[#7A746B]">
              Created by <span className="font-semibold text-[#4A463F]">Mike Ryno Santiago</span> — DNX Intern
            </p>
          )}
        </div>
      </aside>

      {/* Main workspace canvas with desktop header allowance bar */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex sticky top-0 z-20 items-center justify-between border-b border-[#E5E2D9] bg-[#FAF9F5]/95 backdrop-blur-md px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#1F1E1C]">{currentLabel}</span>
            {quota && !quota.isAdmin && (
              <span className="rounded-full bg-[#F4F2EA] border border-[#E5E2D9] px-2.5 py-0.5 text-[11px] font-medium text-[#6B665E]">
                {quota.reportsCount}
                {quota.maxReports === null ? " saved reports" : `/${quota.maxReports} reports`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <AllowancePill quota={quota} />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 sm:py-5">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
