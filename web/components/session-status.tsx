"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

export type SessionState = "ok" | "reconnecting" | "expired";

type StatusPayload = {
  state?: SessionState;
  last_checked?: string | null;
  source?: string | null;
  error?: string;
};

async function fetchStatus(): Promise<StatusPayload> {
  const response = await fetch("/api/status", { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as StatusPayload | null;
  return data ?? { state: "expired" };
}

function Dot({ state }: { state: SessionState | "unknown" }) {
  const color =
    state === "ok"
      ? "bg-emerald-500"
      : state === "reconnecting"
        ? "bg-amber-400"
        : state === "expired"
          ? "bg-red-500"
          : "bg-slate-400";

  const label =
    state === "ok"
      ? strings.sessionOk
      : state === "reconnecting"
        ? strings.sessionReconnecting
        : state === "expired"
          ? strings.sessionExpired
          : strings.sessionUnknown;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--muted)]"
      title={label}
      aria-label={label}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function SessionStatusDot() {
  const [state, setState] = useState<SessionState | "unknown">("unknown");

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setState(data.state ?? "expired");
    } catch {
      setState("expired");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return <Dot state={state} />;
}

export function SessionExpiredPanel({
  onRestored,
}: {
  onRestored?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [psid, setPsid] = useState("");
  const [psidts, setPsidts] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setVisible(data.state === "expired");
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ psid, psidts }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        state?: SessionState;
      } | null;

      // Clear inputs immediately so values are not left on screen.
      setPsid("");
      setPsidts("");

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? strings.sessionRefreshFailed);
        return;
      }

      setMessage(strings.sessionRefreshOk);
      setVisible(false);
      onRestored?.();
    } catch {
      setError(strings.errorServerDown);
    } finally {
      setBusy(false);
    }
  }

  if (!visible) {
    return message ? (
      <div className="mx-4 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        {message}
      </div>
    ) : null;
  }

  return (
    <div className="mx-4 mt-3 rounded-xl border border-red-500/30 bg-[var(--surface)] p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">
        {strings.sessionExpiredTitle}
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{strings.sessionExpiredBody}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        {strings.sessionExpiredHelp}
      </p>

      <form onSubmit={onSubmit} className="mt-3 space-y-3" autoComplete="off">
        <div>
          <label htmlFor="psid-input" className="mb-1 block text-xs font-medium">
            {strings.sessionPsidLabel}
          </label>
          <Input
            id="psid-input"
            name="psid"
            type="password"
            value={psid}
            onChange={(event) => setPsid(event.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div>
          <label
            htmlFor="psidts-input"
            className="mb-1 block text-xs font-medium"
          >
            {strings.sessionPsidtsLabel}
          </label>
          <Input
            id="psidts-input"
            name="psidts"
            type="password"
            value={psidts}
            onChange={(event) => setPsidts(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || !psid.trim()}>
          {busy ? strings.sessionRefreshing : strings.sessionRefresh}
        </Button>
      </form>
    </div>
  );
}
