"use client"

import { Wifi, WifiOff } from "lucide-react";
import { useSocket } from "./provider/socket-provider";

export const SocketIndicator=()=>{
   const { isConnected, status, error, transport, reconnect } = useSocket();

   if(!isConnected){
    return (
        <button
          type="button"
          onClick={reconnect}
          title={error ?? "Reconnecting to realtime"}
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300"
        >
          <WifiOff className="h-3.5 w-3.5" />
          {status === "connecting" ? "Reconnecting" : "Retry realtime"}
        </button>
    )
   }
   return (
    <div
      title={`Realtime connected with ${transport ?? "Socket.IO"}`}
      className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300"
    >
      <Wifi className="h-3.5 w-3.5" />
      {transport === "polling" ? "Live · polling" : "Live"}
    </div>
   )
}
