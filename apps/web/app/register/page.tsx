import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your AETHER workspace.",
};

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your workspace."
      subtitle="Voice-first study, code, interviews, research and memory. Demo mode works without external API keys."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-cyan-300 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
