// A fixed, server-only upstream keeps auth cookies on the workspace origin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: Request) {
  const url = new URL(request.url);
  const upstream = new URL(process.env.SERVER_URL || "http://localhost:3000");
  upstream.pathname = url.pathname;
  upstream.search = url.search;
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "content-length", "transfer-encoding"])
    headers.delete(name);
  headers.set("accept-encoding", "identity");
  let body: Uint8Array | undefined;
  if (!["GET", "HEAD"].includes(request.method) && request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        return Response.json({ error: { message: "Keep imports below 1 MB." } }, { status: 413 });
      }
      chunks.push(part.value);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const outgoing = new Headers(response.headers);
    for (const name of ["connection", "transfer-encoding", "content-encoding", "content-length"])
      outgoing.delete(name);
    outgoing.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json(
      { error: { message: "The workspace server is unavailable. Please try again." } },
      { status: 502 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
  proxy as OPTIONS,
  proxy as HEAD,
};
