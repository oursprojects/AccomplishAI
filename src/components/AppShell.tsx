"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileCheck2,
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
import { isAdminEmail } from "@/lib/admin";

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

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = isAdminEmail(userEmail);
  const navItems: NavItem[] = isAdmin
    ? [...BASE_NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : BASE_NAV;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const currentLabel = navItems.find((i) => i.href === pathname)?.label ?? "Accomplish AI";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5] text-[#1F1E1C]">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[#E5E2D9] bg-[#FAF9F5]/95 backdrop-blur-md px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E2D9] bg-white text-[#1F1E1C] hover:bg-[#F4F2EA] cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#D97757] text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">{currentLabel}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E2D9] bg-white px-2.5 py-1.5 text-xs font-medium text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
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
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D97757] text-white shadow-xs">
                    <Sparkles className="h-4 w-4" />
                  </span>
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
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#E5E2D9] bg-white px-3 py-2 text-xs font-medium text-[#57544E] hover:bg-[#EAE7DD]/60 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sticky sidebar */}
      <aside
        className={`hidden md:flex sticky top-0 h-screen shrink-0 flex-col justify-between border-r border-[#E5E2D9] bg-[#F4F2EA] transition-all duration-200 ${
          collapsed ? "w-[72px] px-2.5 py-4" : "w-60 px-3.5 py-4"
        }`}
      >
        <div className="space-y-5">
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-1"}`}>
            {!collapsed && (
              <Link href="/" className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#D97757] text-white shadow-xs">
                  <Sparkles className="h-4 w-4" />
                </span>
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
            onClick={handleSignOut}
            title="Sign out"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "justify-center gap-2 px-3"
            } rounded-xl border border-[#E5E2D9] bg-white py-2 text-xs font-medium text-[#57544E] hover:bg-[#EAE7DD]/60 transition cursor-pointer`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main workspace canvas */}
      <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 sm:py-6">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
