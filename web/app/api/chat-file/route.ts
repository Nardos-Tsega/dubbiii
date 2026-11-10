import { NextResponse } from "next/server";

const PYTHON_CHAT_FILE_URL = "http://127.0.0.1:8000/chat-file";

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
    // Stream the raw multipart body through to Python without buffering the whole upload.
    const upstream = await fetch(PYTHON_CHAT_FILE_URL, {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
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
