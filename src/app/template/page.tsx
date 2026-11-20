import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { loadActiveTemplateReview } from "@/lib/templates/pipeline";
import { AppShell } from "@/components/AppShell";
import { TemplateScannerCard } from "@/components/TemplateScannerCard";
import TemplateLoading from "./loading";

async function TemplateContent() {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const [review, quota] = await Promise.all([
    loadActiveTemplateReview(supabase, user.id),
    getUserQuotaStatus(supabase, user.id, user.email),
  ]);

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <div className="mx-auto max-w-4xl">
        <TemplateScannerCard initialReview={review} />
      </div>
    </AppShell>
  );
}

export default function TemplatePage() {
  return (
    <Suspense fallback={<TemplateLoading />}>
      <TemplateContent />
    </Suspense>
  );
}
