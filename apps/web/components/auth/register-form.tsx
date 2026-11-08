"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RegisterError {
  error?: { message?: string };
  detail?: Array<{ msg?: string }> | string;
}

function passwordChecks(password: string) {
  return [
    { label: "At least 10 characters", ok: password.length >= 10 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { label: "One number", ok: /\d/.test(password) },
  ];
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const checks = passwordChecks(password);
  const valid = checks.every((check) => check.ok) && password === confirm;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!valid) {
      setError("Check the password requirements and confirmation.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as RegisterError;
        const detail = Array.isArray(payload.detail)
          ? payload.detail[0]?.msg
          : typeof payload.detail === "string"
            ? payload.detail
            : undefined;
        setError(
          payload.error?.message ??
            detail ??
            "We couldn't create that account. Try a different email.",
        );
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        router.push("/login?registered=1");
        return;
      }
      router.push("/chat");
      router.refresh();
    } catch {
      setError("AETHER could not reach the API. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3.5 py-3 text-xs leading-5 text-rose-100"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            id="name"
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="How should AETHER address you?"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a strong password"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-slate-200"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {checks.map((check) => (
            <span
              key={check.label}
              className={`flex items-center gap-1.5 text-[10px] ${
                check.ok ? "text-emerald-300" : "text-slate-500"
              }`}
            >
              <Check
                className={`h-3 w-3 ${check.ok ? "opacity-100" : "opacity-30"}`}
              />
              {check.label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Repeat your password"
        />
        {confirm && confirm !== password ? (
          <p className="text-[10px] text-rose-300">Passwords do not match.</p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="aurora"
        className="w-full"
        disabled={pending || !valid}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Creating workspace…
          </>
        ) : (
          <>
            Create workspace <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-cyan-300 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
