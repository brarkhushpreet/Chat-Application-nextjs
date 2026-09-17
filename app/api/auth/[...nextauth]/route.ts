import { handlers } from "@/auth";
import { NextRequest } from "next/server";

const bodylessMethods = new Set(["GET", "HEAD"]);

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

async function withRequestOrigin(request: NextRequest) {
  const url = new URL(request.url);
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  const protocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    url.protocol.replace(":", "");

  if (!host) return request;

  url.host = host;
  url.protocol = `${protocol}:`;

  return new NextRequest(url, {
    method: request.method,
    headers: request.headers,
    body: bodylessMethods.has(request.method)
      ? undefined
      : await request.arrayBuffer(),
  });
}

export async function GET(request: NextRequest) {
  return handlers.GET(await withRequestOrigin(request));
}

export async function POST(request: NextRequest) {
  return handlers.POST(await withRequestOrigin(request));
}
