import { auth } from "@/auth";
import { fileFormat, MAX_UPLOAD_BYTES, putUpload } from "@/lib/uploads";
import { publicRequestOrigin } from "@/lib/cloudflare";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== publicRequestOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in to upload files" }, { status: 401 });
  const purpose = new URL(request.url).searchParams.get("purpose");
  if (purpose !== "serverImage" && purpose !== "messageFile") return Response.json({ error: "Invalid upload purpose" }, { status: 400 });
  // Bound streamed bodies as well as Content-Length: do not buffer arbitrary uploads.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "File missing" }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); return Response.json({ error: "Maximum file size is 8 MB" }, { status: 413 }); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  const format = fileFormat(data);
  if (!format || (purpose === "serverImage" && format.extension === "pdf")) {
    return Response.json({ error: "Choose a PNG, JPG, GIF, WebP image or a PDF attachment" }, { status: 415 });
  }
  const key = `${crypto.randomUUID()}.${format.extension}`;
  await putUpload(key, data.buffer, { ownerId: session.user.id, type: format.type });
  return Response.json({ url: `/api/files/${key}` });
}
