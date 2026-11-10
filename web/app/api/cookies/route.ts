import { NextResponse } from "next/server";

import { pythonApiHeaders, pythonApiUrl } from "@/lib/python-api";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Gaaffiin sirrii miti." },
      { status: 400 },
    );
  }

  // Never log request bodies — may contain cookies.
  try {
    const response = await fetch(pythonApiUrl("/cookies"), {
      method: "POST",
      headers: pythonApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({
      error: "Deebiin serveeraa sirrii miti.",
    }));

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        error:
          "Serveeri hin hojjenne. Mee akka port 8000 irratti deemaa jiru mirkaneessi.",
        code: "SERVER_DOWN",
      },
      { status: 503 },
    );
  }
}
