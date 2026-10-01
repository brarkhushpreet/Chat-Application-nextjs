import type { PrismaClient } from "@prisma/client";

/** Count on the database, returning only one row per room, not message bodies. */
export async function unreadCounts(
  db: Pick<PrismaClient, "message" | "directMessage">,
  memberId: string,
  channels: { id: string }[],
  conversations: { id: string }[],
  channelReads: Map<string, Date>,
  conversationReads: Map<string, Date>,
) {
  const common = { memberId: { not: memberId }, deleted: false };
  const [channelCounts, conversationCounts] = await Promise.all([
    channels.length ? db.message.groupBy({
      by: ["channelId"], _count: { _all: true },
      where: { ...common, OR: channels.map(({ id }) => ({
        channelId: id, createdAt: { gt: channelReads.get(id) ?? new Date(0) },
      })) },
    }) : [],
    conversations.length ? db.directMessage.groupBy({
      by: ["conversationId"], _count: { _all: true },
      where: { ...common, OR: conversations.map(({ id }) => ({
        conversationId: id, createdAt: { gt: conversationReads.get(id) ?? new Date(0) },
      })) },
    }) : [],
  ]);
  return {
    channelUnreadMap: new Map(channelCounts.map(row => [row.channelId, row._count._all])),
    conversationUnreadMap: new Map(conversationCounts.map(row => [row.conversationId, row._count._all])),
  };
}
