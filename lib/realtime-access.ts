import type { PrismaClient } from "@prisma/client";

export type RoomKind = "channel" | "conversation";
export async function canAccessRoom(db: PrismaClient, userId: string, roomId: string, kind: RoomKind) {
  if (kind === "channel") {
    return Boolean(await db.channel.findFirst({
      where: { id: roomId, server: { members: { some: { profile: { userId } } } } }, select: { id: true },
    }));
  }
  return Boolean(await db.conversation.findFirst({
    where: { id: roomId, OR: [
      { memberOne: { profile: { userId } } }, { memberTwo: { profile: { userId } } },
    ] }, select: { id: true },
  }));
}

export async function markRoomRead(db: PrismaClient, userId: string, roomId: string, kind: RoomKind) {
  if (!(await canAccessRoom(db, userId, roomId, kind))) throw new Error("Room access denied");
  const readAt = new Date();
  const otherMembers = { member: { profile: { userId: { not: userId } } }, readAt: null, createdAt: { lte: readAt } };
  if (kind === "channel") {
    const room = await db.channel.findUniqueOrThrow({ where: { id: roomId }, select: { serverId: true } });
    const reader = await db.member.findFirstOrThrow({ where: { serverId: room.serverId, profile: { userId } }, select: { id: true } });
    await db.message.updateMany({ where: { channelId: roomId, ...otherMembers }, data: { readAt, deliveredAt: readAt } });
    await db.channelReadState.upsert({
      where: { memberId_channelId: { memberId: reader.id, channelId: roomId } },
      create: { memberId: reader.id, channelId: roomId, lastReadAt: readAt }, update: { lastReadAt: readAt },
    });
  } else {
    const room = await db.conversation.findUniqueOrThrow({
      where: { id: roomId }, include: { memberOne: { include: { profile: true } }, memberTwo: true },
    });
    const reader = room.memberOne.profile.userId === userId ? room.memberOne : room.memberTwo;
    await db.directMessage.updateMany({ where: { conversationId: roomId, ...otherMembers }, data: { readAt, deliveredAt: readAt } });
    await db.conversationReadState.upsert({
      where: { memberId_conversationId: { memberId: reader.id, conversationId: roomId } },
      create: { memberId: reader.id, conversationId: roomId, lastReadAt: readAt }, update: { lastReadAt: readAt },
    });
  }
  return readAt.toISOString();
}
