"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { strings } from "@/lib/strings";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;

      setPassword("");

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? strings.loginFailed);
        return;
      }

      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError(strings.errorServerDown);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" autoComplete="off">
      <div>
        <label
          htmlFor="app-password"
          className="mb-1.5 block text-sm font-medium"
        >
          {strings.loginPasswordLabel}
        </label>
        <Input
          id="app-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
          autoComplete="current-password"
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={busy || !password}>
        {busy ? strings.loginSubmitting : strings.loginSubmit}
      </Button>
    </form>
  );
}
