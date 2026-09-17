import { cloudflareEnv } from "./cloudflare";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const validFileKey = (key: string) => /^[0-9a-f-]{36}\.(png|jpg|webp|gif|pdf)$/.test(key);
export function fileFormat(bytes: Uint8Array) {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10)) return { extension: "png", type: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { extension: "jpg", type: "image/jpeg" };
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return { extension: "gif", type: "image/gif" };
  if (text.startsWith("RIFF") && text.slice(8) === "WEBP") return { extension: "webp", type: "image/webp" };
  if (text.startsWith("%PDF-")) return { extension: "pdf", type: "application/pdf" };
  return null;
}
type Metadata = { ownerId: string; type: string };
export async function putUpload(key: string, data: ArrayBuffer, metadata: Metadata) {
  const env = cloudflareEnv();
  if (env) {
    await env.UPLOADS.put(key, data, { httpMetadata: { contentType: metadata.type }, customMetadata: metadata });
    return;
  }
  // Local Node development only. Worker deployments always use the R2 binding.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const directory = path.join(process.cwd(), ".local", "uploads");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, key), Buffer.from(data), { flag: "wx" });
  await fs.writeFile(path.join(directory, `${key}.json`), JSON.stringify(metadata), { flag: "wx" });
}
export async function getUpload(key: string) {
  if (!validFileKey(key)) return null;
  const env = cloudflareEnv();
  if (env) {
    const item = await env.UPLOADS.get(key);
    return item ? { body: item.body as unknown as ReadableStream, ownerId: item.customMetadata?.ownerId,
      type: item.httpMetadata?.contentType ?? "application/octet-stream" } : null;
  }
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), ".local", "uploads", key);
  try {
    const metadata: Metadata = JSON.parse(await fs.readFile(`${file}.json`, "utf8"));
    return { body: new Uint8Array(await fs.readFile(file)), ...metadata };
  } catch { return null; }
}
