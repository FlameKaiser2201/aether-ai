import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your AETHER workspace.",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back."
      subtitle="Sign in to continue your conversations, study sets, interviews and research."
      footer={
        <>
          New to AETHER?{" "}
          <Link href="/register" className="font-medium text-cyan-300 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-xl bg-white/[0.05]" />
            <div className="h-10 animate-pulse rounded-xl bg-white/[0.05]" />
            <div className="h-10 animate-pulse rounded-xl bg-white/[0.05]" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
