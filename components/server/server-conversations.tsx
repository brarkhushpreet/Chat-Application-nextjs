"use client";

import { MessageSquareText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSocket } from "@/components/provider/socket-provider";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { ConversationWithMembersWithProfiles } from "@/types";

interface ServerConversationsProps {
  currentMemberId: string;
  initialConversations: Array<{
    conversation: ConversationWithMembersWithProfiles;
    unreadCount: number;
  }>;
  serverId: string;
}

export function ServerConversations({
  currentMemberId,
  initialConversations,
  serverId,
}: ServerConversationsProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const { socket } = useSocket();
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    if (!socket) {
      return;
    }

    const onConversationCreated = (
      conversation: ConversationWithMembersWithProfiles,
    ) => {
      const belongsToCurrentMember =
        conversation.memberOneId === currentMemberId ||
        conversation.memberTwoId === currentMemberId;
      const belongsToCurrentServer =
        conversation.memberOne.serverId === serverId &&
        conversation.memberTwo.serverId === serverId;

      if (!belongsToCurrentMember || !belongsToCurrentServer) {
        return;
      }

      setConversations((current) => {
        const existingIndex = current.findIndex(
          (item) => item.conversation.id === conversation.id,
        );
        if (existingIndex === -1) {
          return [{ conversation, unreadCount: 0 }, ...current];
        }

        return current.map((item) =>
          item.conversation.id === conversation.id
            ? { ...item, conversation }
            : item,
        );
      });
    };

    const onSidebarMessage = (payload: { kind: string; roomId: string }) => {
      if (payload.kind !== "conversation") {
        return;
      }

      setConversations((current) => current.map((item) => {
        if (item.conversation.id !== payload.roomId) {
          return item;
        }
        const otherMember =
          item.conversation.memberOneId === currentMemberId
            ? item.conversation.memberTwo
            : item.conversation.memberOne;
        const isActivelyReading =
          params?.memberId === otherMember.id &&
          document.visibilityState === "visible";

        return isActivelyReading
          ? item
          : { ...item, unreadCount: item.unreadCount + 1 };
      }));
    };

    const onSidebarRead = (payload: { kind: string; roomId: string }) => {
      if (payload.kind !== "conversation") {
        return;
      }
      setConversations((current) => current.map((item) =>
        item.conversation.id === payload.roomId
          ? { ...item, unreadCount: 0 }
          : item,
      ));
    };

    const onConnect = () => {
      // Socket.IO restores missed packets for short disconnects. If that
      // recovery was not possible, refresh the server data once to reconcile
      // conversations and unread counts missed while offline.
      if (!socket.recovered) router.refresh();
    };

    socket.on("connect", onConnect);
    socket.on("conversation:created", onConversationCreated);
    socket.on("sidebar:message", onSidebarMessage);
    socket.on("sidebar:read", onSidebarRead);
    return () => {
      socket.off("connect", onConnect);
      socket.off("conversation:created", onConversationCreated);
      socket.off("sidebar:message", onSidebarMessage);
      socket.off("sidebar:read", onSidebarRead);
    };
  }, [currentMemberId, params?.memberId, router, serverId, socket]);

  if (conversations.length === 0) {
    return null;
  }

  return (
    <section className="mb-3">
      <div className="flex items-center gap-2 px-1 pb-2 pt-3">
        <MessageSquareText className="h-3.5 w-3.5 text-black/30 dark:text-white/30" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Direct messages
        </p>
      </div>
      <div className="space-y-1">
        {conversations.map(({ conversation, unreadCount }) => {
          const otherMember =
            conversation.memberOneId === currentMemberId
              ? conversation.memberTwo
              : conversation.memberOne;
          const isActive = params?.memberId === otherMember.id;

          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() =>
                router.push(`/servers/${serverId}/conversations/${otherMember.id}`)
              }
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                "hover:bg-foreground/[0.04] dark:hover:bg-white/[0.055]",
                isActive &&
                  "bg-card text-primary shadow-sm ring-1 ring-inset ring-border dark:shadow-none dark:ring-transparent dark:bg-primary/15",
              )}
            >
              <UserAvatar
                src={otherMember.profile.imageUrl}
                className="h-8 w-8 ring-1 ring-black/10 dark:ring-white/10"
              />
              <span className="min-w-0 flex-1">
                <span className={cn(
                  "block truncate text-sm font-semibold text-foreground/80 group-hover:text-foreground",
                  isActive && "text-[#5647d8] dark:text-[#b2aaff]",
                )}>
                  {otherMember.profile.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Private conversation
                </span>
              </span>
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
