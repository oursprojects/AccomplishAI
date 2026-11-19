import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadActiveTemplateReview } from "@/lib/templates/pipeline";
import { AppShell } from "@/components/AppShell";
import { TemplateScannerCard } from "@/components/TemplateScannerCard";

async function TemplateContent() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const review = await loadActiveTemplateReview(supabase, user.id);

  return (
    <AppShell userEmail={user.email ?? ""}>
      <div className="mx-auto max-w-4xl">
        <TemplateScannerCard initialReview={review} />
      </div>
    </AppShell>
  );
}

export default function TemplatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Loading template...
        </div>
      }
    >
      <TemplateContent />
    </Suspense>
  );
}
