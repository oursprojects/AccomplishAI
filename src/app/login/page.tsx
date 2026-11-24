import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#F8F8F6]" />}>
      <AuthForm />
    </Suspense>
  );
}
