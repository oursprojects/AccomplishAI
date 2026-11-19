import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "@/components/ProfileForm";

async function ProfileContent() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours")
    .eq("id", user.id)
    .maybeSingle();

  const initial = data ?? {
    name_last_first: "",
    name_first_last: "",
    office: "YML",
    default_verifier: "",
    default_daily_hours: 8,
  };

  return (
    <AppShell userEmail={user.email ?? ""}>
      <ProfileForm initial={initial} />
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Loading profile...
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
