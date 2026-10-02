"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigationFeedback } from "@/components/provider/navigation-feedback";
import { Phone, PhoneOff, Video, X } from "lucide-react";
import { useSocket } from "@/components/provider/socket-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import type { IncomingCall } from "@/lib/call-invitations";
import { respondToCall } from "@/lib/call-response";

export function IncomingCallNotification() {
  const { socket, isConnected } = useSocket();
  const { navigate } = useNavigationFeedback();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dismissed = useRef(new Set<string>());
  const answering = useRef<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const receive = (call: IncomingCall) => {
      if (call.expiresAt <= Date.now() || dismissed.current.has(call.id)) return;
      setIncoming(call);
      setPending(false);
    };
    const dismiss = ({ id }: { id: string }) => {
      // The server broadcasts dismissal to all tabs before sending the ACK.
      // Keep this tab's pending prompt until its response/retry completes.
      if (answering.current === id) return;
      dismissed.current.add(id);
      if (dismissed.current.size > 128) dismissed.current.delete(dismissed.current.values().next().value!);
      setIncoming(current => current?.id === id ? null : current);
    };
    const status = ({ message }: { message: string }) => setNotice(message);
    const sync = () => socket.emit("call:sync", {});
    const disconnect = () => { setIncoming(null); setPending(false); setNotice(null); };
    socket.on("call:incoming", receive);
    socket.on("call:dismissed", dismiss);
    socket.on("call:ring-status", status);
    socket.on("connect", sync);
    socket.on("resync", sync);
    socket.on("disconnect", disconnect);
    if (socket.connected) sync();
    return () => {
      socket.off("call:incoming", receive);
      socket.off("call:dismissed", dismiss);
      socket.off("call:ring-status", status);
      socket.off("connect", sync);
      socket.off("resync", sync);
      socket.off("disconnect", disconnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(() => setIncoming(current => current?.id === incoming.id ? null : current),
      Math.max(0, incoming.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [incoming]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 15_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const respond = async (action: "accept" | "decline") => {
    if (!socket || !incoming || answering.current || pending || !isConnected) return;
    const call = incoming;
    answering.current = call.id;
    setPending(true);
    setNotice(null);
    try {
      const result = await respondToCall(socket, call.id, action);
      if (!result.ok) {
        setNotice(result.error ?? "This call is no longer available.");
        setIncoming(current => current?.id === call.id ? null : current);
        return;
      }
      dismissed.current.add(call.id);
      setIncoming(current => current?.id === call.id ? null : current);
      if (action === "accept" && result.url?.startsWith("/servers/")) navigate(result.url, "Opening accepted call…");
    } catch {
      setNotice("The call server did not confirm your response. Check the realtime connection and try again.");
    } finally {
      answering.current = null;
      setPending(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-3 sm:left-auto sm:w-96">
      {incoming && (
        <section role="dialog" aria-labelledby="incoming-call-title" aria-describedby="incoming-call-description"
          className="pointer-events-auto w-full rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl">
          <div className="flex items-center gap-3">
            <UserAvatar src={incoming.callerImageUrl} />
            <div className="min-w-0 flex-1" aria-live="assertive">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">Incoming {incoming.video ? "video" : "audio"} call</p>
              <h2 id="incoming-call-title" className="mt-1 truncate font-semibold">{incoming.callerName}</h2>
              <p id="incoming-call-description" className="truncate text-sm text-muted-foreground">{incoming.roomName}</p>
            </div>
            <span className="rounded-full bg-primary/10 p-3 text-primary"><Phone className="h-5 w-5 motion-safe:animate-pulse" /></span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="outline" disabled={pending || !isConnected} onClick={() => respond("decline")}>
              <PhoneOff className="mr-2 h-4 w-4" />Decline
            </Button>
            <Button disabled={pending || !isConnected} onClick={() => respond("accept")}>
              {incoming.video ? <Video className="mr-2 h-4 w-4" /> : <Phone className="mr-2 h-4 w-4" />}
              {pending ? "Connecting…" : "Accept"}
            </Button>
          </div>
        </section>
      )}
      {notice && (
        <div className="pointer-events-auto flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg">
          <Phone className="h-4 w-4 shrink-0 text-primary" />
          <p role="status" className="flex-1 text-sm">{notice}</p>
          <button type="button" aria-label="Dismiss call status" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
