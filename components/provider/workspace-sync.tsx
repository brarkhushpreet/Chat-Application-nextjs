"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "./socket-provider";

export function WorkspaceSync() {
  const { socket } = useSocket();
  const router = useRouter();
  useEffect(() => {
    if (!socket) return;
    const refresh = () => router.refresh();
    socket.on("space:updated", refresh);
    return () => { socket.off("space:updated", refresh); };
  }, [socket, router]);
  return null;
}
