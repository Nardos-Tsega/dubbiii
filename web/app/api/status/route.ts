import { NextResponse } from "next/server";

import { pythonApiHeaders, pythonApiUrl } from "@/lib/python-api";

export async function GET() {
  try {
    const response = await fetch(pythonApiUrl("/status"), {
      headers: pythonApiHeaders(),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({
      state: "expired",
      last_checked: null,
      source: null,
      error: "Deebiin serveeraa sirrii miti.",
    }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        state: "expired",
        last_checked: null,
        source: null,
        error:
          "Serveeri hin hojjenne. Mee akka port 8000 irratti deemaa jiru mirkaneessi.",
        code: "SERVER_DOWN",
      },
      { status: 503 },
    );
  }
}
