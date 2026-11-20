import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "@/components/ProfileForm";
import SubpageLoading from "./loading";

async function ProfileContent() {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const [{ data }, quota] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date, target_ojt_hours",
      )
      .eq("id", user.id)
      .maybeSingle(),
    getUserQuotaStatus(supabase, user.id, user.email),
  ]);

  const initial = data ?? {
    name_last_first: "",
    name_first_last: "",
    office: "DNX",
    default_verifier: "",
    default_daily_hours: 8,
    internship_start_date: null,
    target_ojt_hours: 486,
  };

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <ProfileForm initial={initial} />
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<SubpageLoading />}>
      <ProfileContent />
    </Suspense>
  );
}
