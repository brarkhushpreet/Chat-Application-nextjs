import { db } from "./db";
import { emitUserEvent } from "./realtime";

export async function notifySpaceUpdated(serverId: string) {
  const members = await db.member.findMany({ where: { serverId }, select: { profile: { select: { userId: true } } } });
  await Promise.all(members.map(member => emitUserEvent(member.profile.userId, "space:updated", { serverId })));
}
