import { Suspense } from "react";

import { strings } from "@/lib/strings";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-2xl font-semibold tracking-tight">{strings.appName}</p>
        <h1 className="mt-4 text-lg font-semibold">{strings.loginTitle}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{strings.loginSubtitle}</p>
        <Suspense fallback={<p className="mt-6 text-sm text-[var(--muted)]">...</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
