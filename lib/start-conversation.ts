import type { ConversationWithMembersWithProfiles } from "@/types";

export async function startConversation(serverId: string, memberId: string) {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId, memberId }),
  });

  if (!response.ok) {
    throw new Error("Unable to start conversation");
  }

  return response.json() as Promise<ConversationWithMembersWithProfiles>;
}
