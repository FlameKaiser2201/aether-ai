"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeCallback(value: string | null): string {
  if (!value) return "/chat";
  if (!value.startsWith("/") || value.startsWith("//")) return "/chat";
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError(
          "That email and password combination didn't work. Check your details, or make sure the AETHER API is running.",
        );
        return;
      }
      router.push(safeCallback(searchParams.get("callbackUrl")));
      router.refresh();
    } catch {
      setError("AETHER could not reach the authentication service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {searchParams.get("registered") === "1" ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-3 text-xs leading-5 text-emerald-100">
          Account created. Sign in to open your workspace.
        </div>
      ) : null}

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
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <span className="text-[10px] text-slate-500">
            Minimum 10 characters
          </span>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
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
      </div>

      <Button type="submit" variant="aurora" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
          </>
        ) : (
          <>
            Open workspace <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <p className="text-center text-[11px] leading-5 text-slate-500">
        By continuing you agree to keep your account credentials private. AETHER
        never stores provider API keys in the browser.
      </p>

      <p className="text-center text-xs text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="font-medium text-cyan-300 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
