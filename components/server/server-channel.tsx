"use client";

import { 
  Channel, 
  ChannelType, 
  MemberRole,
  Server
} from "@prisma/client";
import { AudioLines, Edit, Lock, MessageCircleMore, Trash, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/action-tooltip";
import { ModalType, useModal } from "@/hooks/use-modal-store";
import { useSocket } from "@/components/provider/socket-provider";

interface ServerChannelProps {
  channel: Channel;
  server: Server;
  role?: MemberRole;
  initialUnreadCount?: number;
}

const iconMap = {
  [ChannelType.TEXT]: MessageCircleMore,
  [ChannelType.AUDIO]: AudioLines,
  [ChannelType.VIDEO]: Video,
}

export const ServerChannel = ({
  channel,
  server,
  role,
  initialUnreadCount = 0,
}: ServerChannelProps) => {
  const { onOpen } = useModal();
  const params = useParams();
  const router = useRouter();
  const { socket } = useSocket();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const Icon = iconMap[channel.type];

  useEffect(() => {
    if (!socket) {
      return;
    }

    const onMessage = (payload: { kind: string; roomId: string }) => {
      if (payload.kind !== "channel" || payload.roomId !== channel.id) {
        return;
      }
      const isActivelyReading =
        params?.channelId === channel.id && document.visibilityState === "visible";
      if (!isActivelyReading) {
        setUnreadCount((count) => count + 1);
      }
    };
    const onRead = (payload: { kind: string; roomId: string }) => {
      if (payload.kind === "channel" && payload.roomId === channel.id) {
        setUnreadCount(0);
      }
    };

    socket.on("sidebar:message", onMessage);
    socket.on("sidebar:read", onRead);
    return () => {
      socket.off("sidebar:message", onMessage);
      socket.off("sidebar:read", onRead);
    };
  }, [channel.id, params?.channelId, socket]);

  const onClick = () => {
    router.push(`/servers/${params?.serverId}/channels/${channel.id}`)
  }

  const onAction = (e: React.MouseEvent, action: ModalType) => {
    e.stopPropagation();
    onOpen(action, { channel, server });
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "group mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-foreground/[0.04] dark:hover:bg-white/[0.055]",
        params?.channelId === channel.id && "bg-card text-primary shadow-sm ring-1 ring-inset ring-border dark:shadow-none dark:ring-transparent dark:bg-primary/15"
      )}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-black/[0.04] text-black/40 transition dark:bg-white/[0.05] dark:text-white/40", params?.channelId === channel.id && "bg-[#7567ff]/10 text-[#7567ff] dark:text-[#a39bff]")}>
        <Icon className="h-4 w-4" />
      </span>
      <p className={cn(
        "line-clamp-1 text-left text-sm font-semibold text-foreground/80 transition group-hover:text-foreground",
        params?.channelId === channel.id && "text-[#5f50dc] dark:text-[#a39bff]"
      )}>
        {channel.name}
      </p>
      {unreadCount > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
      {channel.name !== "general" && role !== MemberRole.GUEST && (
        <div className="flex items-center gap-x-2">
          <ActionTooltip label="Edit">
            <Edit
              onClick={(e) => onAction(e, "editChannel")}
              className="hidden group-hover:block w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition"
            />
          </ActionTooltip>
          <ActionTooltip label="Delete">
            <Trash
              onClick={(e) => onAction(e, "deleteChannel")}
              className="hidden group-hover:block w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition"
            />
          </ActionTooltip>
        </div>
      )}
      {channel.name === "general" && (
        <Lock
          className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
        />
      )}
    </button>
  )
}
