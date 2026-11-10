import { NextRequest, NextResponse } from "next/server";

import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { strings } from "@/lib/strings";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      { error: strings.loginRateLimited },
      { status: 429 },
    );
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json(
      { error: strings.loginInvalid },
      { status: 400 },
    );
  }

  const expected = process.env.APP_PASSWORD || "";
  const provided = typeof body.password === "string" ? body.password : "";

  if (!expected || provided !== expected) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: strings.loginFailed },
      { status: 401 },
    );
  }

  clearLoginFailures(ip);

  try {
    const token = await createSessionToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: strings.loginConfigError },
      { status: 500 },
    );
  }
}
