import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getUpload, validFileKey } from "@/lib/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { key } = await params;
  if (!validFileKey(key)) return new Response("Not found", { status: 404 });
  const file = await getUpload(key);
  if (!file) return new Response("Not found", { status: 404 });
  const userId = session.user.id;
  if (file.ownerId !== userId) {
    const url = `/api/files/${key}`;
    const [server, message, direct] = await Promise.all([
      db.server.findFirst({ where: { imageUrl: url, members: { some: { profile: { userId } } } }, select: { id: true } }),
      db.message.findFirst({ where: { fileUrl: url, deleted: false, channel: { server: { members: { some: { profile: { userId } } } } } }, select: { id: true } }),
      db.directMessage.findFirst({ where: { fileUrl: url, deleted: false, conversation: { OR: [
        { memberOne: { profile: { userId } } }, { memberTwo: { profile: { userId } } },
      ] } }, select: { id: true } }),
    ]);
    if (!server && !message && !direct) return new Response("Not found", { status: 404 });
  }
  return new Response(file.body, { headers: {
    "Content-Type": file.type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    "Content-Disposition": `${file.type === "application/pdf" ? "attachment" : "inline"}; filename="${key}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
