"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileCheck2,
  FilePlus2,
  FolderKanban,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QuotaStatus } from "@/lib/admin";
import { QuotaGaugeIcon } from "@/components/icons/AccomplishIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

const BASE_NAV: NavItem[] = [
  { href: "/", label: "My Reports", icon: FolderKanban, matchPrefix: "/reports" },
  { href: "/template", label: "Template", icon: FileCheck2 },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function NavPendingSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[#C86343] shrink-0" />;
}

function AllowancePill({ quota }: { quota?: QuotaStatus }) {
  if (!quota) return null;

  const variant = quota.isAdmin
    ? "accent"
    : quota.isBlocked || quota.remaining === 0
      ? "destructive"
      : quota.remaining <= 3
        ? "warning"
        : "outline";

  return (
    <Badge
      variant={variant}
      title="Remaining AI prompts today (resets 12:00 AM Manila time)"
      className="py-1 shadow-2xs"
    >
      <QuotaGaugeIcon className="h-3.5 w-3.5 text-[#D97757] shrink-0" />
      {quota.isAdmin ? (
        <span>Admin · Unlimited AI</span>
      ) : quota.isBlocked ? (
        <span>AI Paused</span>
      ) : (
        <span>
          <strong>{quota.remaining}</strong>/{quota.dailyLimit} prompts left
        </span>
      )}
    </Badge>
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
  const [creatingReport, setCreatingReport] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [isNavTransition, startNavTransition] = useTransition();

  function isNavActive(item: NavItem): boolean {
    if (pathname === item.href) return true;
    if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) return true;
    return false;
  }

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

  async function handleCreateReport() {
    if (creatingReport) return;
    setNavError(null);
    setCreatingReport(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { report?: { id: string }; error?: string };
      if (!res.ok || !json.report) {
        throw new Error(json.error ?? "Could not create a new report.");
      }
      setMobileOpen(false);
      startNavTransition(() => {
        router.push(`/reports/${json.report!.id}`);
      });
    } catch (err) {
      setNavError(err instanceof Error ? err.message : "Could not create report.");
      setCreatingReport(false);
    }
  }

  const currentLabel =
    navItems.find((i) => isNavActive(i))?.label ?? "Accomplish AI";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5] text-[#1F1E1C]">
      {/* Subtle top progress bar during imperative route transitions */}
      {(creatingReport || isNavTransition) && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-[#F0D5C9] overflow-hidden">
          <div className="h-full w-1/2 bg-[#D97757] animate-[pulse_0.9s_ease-in-out_infinite] rounded-full" />
        </div>
      )}

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
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo.png"
              alt="Accomplish AI"
              width={40}
              height={40}
              className="h-9 w-9 rounded-xl object-contain shrink-0"
            />
            <span className="text-sm font-semibold tracking-tight truncate">{currentLabel}</span>
          </Link>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AllowancePill quota={quota} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            title="Sign out"
            className="rounded-xl"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
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
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <Image
                    src="/logo.png"
                    alt="Accomplish AI"
                    width={52}
                    height={52}
                    className="h-12 w-12 rounded-xl object-contain shrink-0"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-[#1F1E1C]">Accomplish AI</span>
                    <span className="block text-[11px] text-[#66645E]">Weekly Report Workspace</span>
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

              <Button
                type="button"
                variant="accent"
                disabled={creatingReport || (quota ? !quota.canCreateReport : false)}
                onClick={() => void handleCreateReport()}
                className="w-full"
              >
                {creatingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                <span>{creatingReport ? "Creating..." : "New Report"}</span>
              </Button>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(item);
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
                      <NavPendingSpinner />
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
                    <Badge variant="accent" className="text-[10px] px-2 py-0">
                      Admin
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={signingOut}
                onClick={() => {
                  setMobileOpen(false);
                  void handleSignOut();
                }}
                className="w-full"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{signingOut ? "Signing out..." : "Sign out"}</span>
              </Button>
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
              <Link
                href="/"
                className="flex items-center gap-2.5 min-w-0"
              >
                <Image
                  src="/logo.png"
                  alt="Accomplish AI"
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-xl object-contain"
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

          <Button
            type="button"
            variant="accent"
            disabled={creatingReport || (quota ? !quota.canCreateReport : false)}
            onClick={() => void handleCreateReport()}
            title="Create a new Weekly Accomplishment Report"
            className={`w-full ${collapsed ? "px-0" : ""}`}
          >
            {creatingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <FilePlus2 className="h-3.5 w-3.5 shrink-0" />}
            {!collapsed && <span>{creatingReport ? "Creating..." : "New Report"}</span>}
          </Button>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item);
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
                  {!collapsed && <NavPendingSpinner />}
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
                  <Badge variant="accent" className="text-[10px] px-2 py-0">
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            title="Sign out"
            className="w-full"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
          </Button>

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
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-[#1F1E1C]">{currentLabel}</span>
            {quota && !quota.isAdmin && (
              <Badge variant="default" className="font-medium">
                {quota.reportsCount}
                {quota.maxReports === null ? " saved reports" : `/${quota.maxReports} reports`}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <AllowancePill quota={quota} />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 sm:py-5">
          {navError && (
            <div className="mx-auto max-w-7xl mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 flex items-center justify-between">
              <span>{navError}</span>
              <button type="button" onClick={() => setNavError(null)} className="text-xs underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
