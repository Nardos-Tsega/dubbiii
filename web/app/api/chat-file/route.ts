import { NextResponse } from "next/server";

import { pythonApiHeaders, pythonApiUrl } from "@/lib/python-api";

type DuplexRequestInit = RequestInit & { duplex?: "half" };

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Gaaffiin sirrii miti. Faayila multipart ta'uu qaba." },
      { status: 400 },
    );
  }

  if (!request.body) {
    return NextResponse.json(
      { error: "Qaamni gaaffii duwwaa dha. Mee faayila ergi." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(pythonApiUrl("/chat-file"), {
      method: "POST",
      headers: pythonApiHeaders({
        "content-type": contentType,
      }),
      body: request.body,
      duplex: "half",
      cache: "no-store",
    } as DuplexRequestInit);

    const data = await upstream.json().catch(() => ({
      error: "Deebiin serveeraa sirrii miti.",
    }));

    return NextResponse.json(data, { status: upstream.status });
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
