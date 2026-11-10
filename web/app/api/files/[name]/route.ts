import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { name } = await context.params;
  const safeName = name.replace(/[\\/]/g, "");
  if (!safeName || safeName !== name) {
    return NextResponse.json(
      { error: "Maqaan faayilaa sirrii miti." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(
      `http://127.0.0.1:8000/files/${encodeURIComponent(safeName)}`,
      { cache: "no-store" },
    );

    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({
        error: "Faayilli hin argamne.",
      }));
      return NextResponse.json(data, { status: upstream.status });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentDisposition =
      upstream.headers.get("content-disposition") ||
      `inline; filename="${safeName}"`;

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
