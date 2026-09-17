import { db } from "./db";
import { emitUserEvent } from "./realtime";
import type { ConversationWithMembersWithProfiles } from "@/types";

export const getOrCreateConversation = async (memberOneId: string, memberTwoId: string) => {
  const existingConversation =
    await findConversation(memberOneId, memberTwoId) ||
    await findConversation(memberTwoId, memberOneId);

  if (existingConversation) {
    return existingConversation;
  }

  const conversation = await createNewConversation(memberOneId, memberTwoId);
  if (conversation) {
    await notifyConversationParticipants(conversation);
  }

  return conversation;
};

export async function notifyConversationParticipants(
  conversation: ConversationWithMembersWithProfiles,
) {
  for (const userId of new Set([
    conversation.memberOne.profile.userId,
    conversation.memberTwo.profile.userId,
  ])) {
    await emitUserEvent(userId, "conversation:created", conversation);
  }
}

const conversationInclude = {
  memberOne: {
    include: { profile: true },
  },
  memberTwo: {
    include: { profile: true },
  },
} as const;

const findConversation = async (memberOneId: string, memberTwoId: string) => {
  try {
    return await db.conversation.findFirst({
      where: {
        memberOneId,
        memberTwoId,
      },
      include: conversationInclude,
    });
  } catch {
    return null;
  }
};

const createNewConversation = async (memberOneId: string, memberTwoId: string) => {
  const [canonicalMemberOneId, canonicalMemberTwoId] = [memberOneId, memberTwoId].sort();

  try {
    return await db.conversation.create({
      data: {
        memberOneId: canonicalMemberOneId,
        memberTwoId: canonicalMemberTwoId,
      },
      include: conversationInclude,
    });
  } catch {
    return (
      await findConversation(canonicalMemberOneId, canonicalMemberTwoId) ||
      await findConversation(canonicalMemberTwoId, canonicalMemberOneId)
    );
  }
};
