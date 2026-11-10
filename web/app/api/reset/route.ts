import { NextResponse } from "next/server";

const PYTHON_RESET_URL = "http://127.0.0.1:8000/reset";

export async function POST() {
  try {
    const response = await fetch(PYTHON_RESET_URL, {
      method: "POST",
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
          "Serveeri Python hin hojjenne. Mee akka port 8000 irratti deemaa jiru mirkaneessi.",
        code: "SERVER_DOWN",
      },
      { status: 503 },
    );
  }
}
