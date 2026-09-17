"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { CloudflareSocket, type RealtimeSocket } from "@/lib/cloudflare-socket";

type SocketContextType = {
  socket: RealtimeSocket | null;
  isConnected: boolean;
  status: "idle" | "connecting" | "connected" | "disconnected";
  error: string | null;
  transport: "polling" | "websocket" | null;
  reconnect: () => void;
};
const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false, status: "idle", error: null, transport: null, reconnect: () => {} });
export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [status, setStatus] = useState<SocketContextType["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<SocketContextType["transport"]>(null);
  const socketRef = useRef<RealtimeSocket | null>(null);
  const reconnect = useCallback(() => {
    const current = socketRef.current;
    if (current && !current.connected) { current.disconnect(); current.connect(); }
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let instance: RealtimeSocket | null = null;
    const initialize = async () => {
      try {
        const response = await fetch("/api/realtime/config", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("Realtime configuration unavailable");
        const config = await response.json();
        if (disposed) return;
        if (config.transport === "cloudflare") {
          instance = new CloudflareSocket();
          instance.on("transport", setTransport);
        } else {
          const local = io({ path: "/socket.io", transports: ["websocket", "polling"], tryAllTransports: true,
            autoConnect: false, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500,
            reconnectionDelayMax: 5000, timeout: 10000, withCredentials: true });
          local.on("connect", () => {
            setTransport(local.io.engine.transport.name as "polling" | "websocket");
            local.io.engine.once("upgrade", next => setTransport(next.name as "polling" | "websocket"));
          });
          instance = local;
        }
        socketRef.current = instance;
        instance.on("connect", () => { setSocket(instance); setStatus("connected"); setError(null); });
        instance.on("disconnect", () => {
          setTransport(null); setStatus(navigator.onLine ? "connecting" : "disconnected");
          setError("Connection interrupted. Reconnecting…");
        });
        instance.on("connect_error", (err: Error) => {
          if (instance?.connected) return;
          setStatus(navigator.onLine ? "connecting" : "disconnected"); setError(err.message);
        });
        instance.connect();
      } catch {
        if (!disposed) { setError("Unable to reach the server. Retrying…"); retry = setTimeout(initialize, 3000); }
      }
    };
    const resume = () => { if (instance && !instance.connected && !instance.active && navigator.onLine) instance.connect(); };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("online", resume); window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visible);
    const watchdog = setInterval(resume, 5000);
    void initialize();
    return () => {
      disposed = true; clearTimeout(retry); clearInterval(watchdog);
      window.removeEventListener("online", resume); window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visible);
      instance?.disconnect(); socketRef.current = null;
    };
  }, []);
  const value = useMemo(() => ({ socket, status, error, transport, reconnect, isConnected: status === "connected" }), [socket, status, error, transport, reconnect]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
