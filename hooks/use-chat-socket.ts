import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Member, Message, Profile } from "@prisma/client";
import { useSocket } from "@/components/provider/socket-provider";



type ChatSocketProps = {
  addKey: string;
  updateKey: string;
  queryKey: string;
  roomId: string;
  kind: "channel" | "conversation";
}

type MessageWithMemberWithProfile = Message & {
  member: Member & {
    profile: Profile;
  }
}

type ChatPage = {
  items: MessageWithMemberWithProfile[];
  nextCursor?: string | null;
};

type ChatInfiniteData = {
  pages: ChatPage[];
  pageParams: unknown[];
};

type ChatReadPayload = {
  roomId: string;
  readerUserId: string;
  readAt: string;
};

export const useChatSocket = ({
  addKey,
  updateKey,
  queryKey,
  roomId,
  kind,
}: ChatSocketProps) => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) {
      return;
    }

    let disposed = false;
    let joinRetry: number | undefined;

    const markRoomRead = () => {
      if (!socket.connected || document.visibilityState !== "visible") {
        return;
      }

      socket.emit("room:read", { roomId, kind });
    };

    const joinRoom = () => {
      if (!socket.connected || disposed) return;
      if (joinRetry) window.clearTimeout(joinRetry);

      socket.timeout(8_000).emit(
        "room:join",
        { roomId, kind },
        (timeoutError: Error | null, result?: { ok: boolean }) => {
          if (disposed) return;
          if (timeoutError) {
            joinRetry = window.setTimeout(joinRoom, 1_000);
            return;
          }
          if (result?.ok) {
            void queryClient.invalidateQueries({ queryKey: [queryKey] });
            markRoomRead();
          }
        },
      );
    };

    const onUpdate = (message: MessageWithMemberWithProfile) => {
      queryClient.setQueryData<ChatInfiniteData>([queryKey], (oldData) => {
        if (!oldData || !oldData.pages || oldData.pages.length === 0) {
          return oldData;
        }

        const newData = oldData.pages.map((page) => {
          return {
            ...page,
            items: page?.items?.map((item: MessageWithMemberWithProfile) => {
              if (item.id === message.id) {
                return message;
              }
              return item;
            })
          }
        });

        return {
          ...oldData,
          pages: newData,
        }
      });

      markRoomRead();
    };

    const onAdd = (message: MessageWithMemberWithProfile) => {
      queryClient.setQueryData<ChatInfiniteData>([queryKey], (oldData) => {
        if (!oldData || !oldData.pages || oldData.pages.length === 0) {
          return {
            pages: [{
              items: [message],
            }],
            pageParams: [undefined],
          }
        }

        const newData = [...oldData.pages];

        if (newData.some((page) => page.items?.some((item: MessageWithMemberWithProfile) => item.id === message.id))) {
          return oldData;
        }

        newData[0] = {
          ...newData[0],
          items: [
            message,
            ...newData[0].items,
          ]
        };

        return {
          ...oldData,
          pages: newData,
        };
      });

      markRoomRead();
    };

    const onRead = ({
      roomId: readRoomId,
      readerUserId,
      readAt,
    }: ChatReadPayload) => {
      if (readRoomId !== roomId) {
        return;
      }

      const readTimestamp = new Date(readAt);
      queryClient.setQueryData<ChatInfiniteData>([queryKey], (oldData) => {
        if (!oldData?.pages?.length) {
          return oldData;
        }

        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => {
              const wasSentByReader = item.member.profile.userId === readerUserId;
              const existedWhenMarkedRead = new Date(item.createdAt) <= readTimestamp;

              if (!item.readAt && !wasSentByReader && existedWhenMarkedRead) {
                return { ...item, readAt: readTimestamp };
              }

              return item;
            }),
          })),
        };
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markRoomRead();
      }
    };

    socket.on("connect", joinRoom);
    socket.on(updateKey, onUpdate);
    socket.on(addKey, onAdd);
    socket.on("chat:read", onRead);
    window.addEventListener("focus", markRoomRead);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (socket.connected) joinRoom();

    return () => {
      disposed = true;
      if (joinRetry) window.clearTimeout(joinRetry);
      socket.emit("room:leave", roomId);
      socket.off("connect", joinRoom);
      socket.off(addKey, onAdd);
      socket.off(updateKey, onUpdate);
      socket.off("chat:read", onRead);
      window.removeEventListener("focus", markRoomRead);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }, [queryClient, addKey, kind, queryKey, roomId, socket, updateKey]);
}
