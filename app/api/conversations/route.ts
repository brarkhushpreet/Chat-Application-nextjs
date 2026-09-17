import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getOrCreateConversation,
  notifyConversationParticipants,
} from "@/lib/conversation";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      serverId?: string;
      memberId?: string;
    };
    const { serverId, memberId } = body;

    if (!serverId || !memberId) {
      return NextResponse.json(
        { error: "Server and member are required" },
        { status: 400 },
      );
    }

    const [currentMember, targetMember] = await Promise.all([
      db.member.findFirst({
        where: { serverId, profileId: profile.id },
        select: { id: true },
      }),
      db.member.findFirst({
        where: { id: memberId, serverId },
        select: { id: true },
      }),
    ]);

    if (!currentMember || !targetMember || currentMember.id === targetMember.id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const conversation = await getOrCreateConversation(currentMember.id, targetMember.id);
    if (!conversation) {
      return NextResponse.json(
        { error: "Unable to start conversation" },
        { status: 500 },
      );
    }

    // Re-emit existing conversations too, so a client with a stale sidebar
    // repairs itself immediately without waiting for a route refresh.
    await notifyConversationParticipants(conversation);

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("[CONVERSATIONS_POST]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
