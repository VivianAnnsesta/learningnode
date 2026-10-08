import { NextResponse, type NextRequest } from "next/server";

const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

const isLocalOrigin = (value: string, expectedPort: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      localHosts.has(url.hostname) &&
      url.port === expectedPort
    );
  } catch {
    return false;
  }
};

const parseHost = (value: string | null) => {
  if (!value) return null;
  try {
    return new URL(`http://${value}`);
  } catch {
    return null;
  }
};

export function middleware(request: NextRequest) {
  const expectedToken = process.env.ENGLISHNODE_LOCAL_API_TOKEN;
  if (!expectedToken) return NextResponse.next();

  const host = parseHost(request.headers.get("host"));
  const origin = request.headers.get("origin");
  const token = request.headers.get("x-englishnode-local-token");

  if (
    !host ||
    !localHosts.has(host.hostname.toLowerCase()) ||
    !host.port ||
    (origin && !isLocalOrigin(origin, host.port))
  ) {
    return NextResponse.json({ error: "本地 API 只接受 localhost 请求。" }, { status: 403 });
  }
  if (token !== expectedToken) {
    return NextResponse.json({ error: "本地 API 未授权。" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*"
};
