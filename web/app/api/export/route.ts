import { NextResponse } from "next/server";

const PYTHON_EXPORT_URL = "http://127.0.0.1:8000/export";

type DuplexRequestInit = RequestInit & { duplex?: "half" };

export async function POST(request: Request) {
  if (!request.body) {
    return NextResponse.json(
      { error: "Qaamni gaaffii duwwaa dha." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(PYTHON_EXPORT_URL, {
      method: "POST",
      headers: {
        "content-type":
          request.headers.get("content-type") || "application/json",
      },
      body: request.body,
      duplex: "half",
      cache: "no-store",
    } as DuplexRequestInit);

    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({
        error: "Buufachuun hin milkoofne.",
      }));
      return NextResponse.json(data, { status: upstream.status });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentDisposition =
      upstream.headers.get("content-disposition") ||
      'attachment; filename="deebii.bin"';

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "Cache-Control": "no-store",
      },
    });
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
