"use client"

import { Badge } from "./ui/badge";
import { useSocket } from "./provider/socket-provider"

export const SocketIndicator=()=>{
   const {isConnected} =useSocket();

   if(!isConnected){
    return (
        <Badge
        variant="outline"
        className="bg-yellow-600 text-white border-none"
        >
          Fallback:Polling every 1 second
        </Badge>
    )
   }
   return (
    <Badge
        variant="outline"
        className="bg-emerald-600 text-white border-none"
        >
          Live: Real Time updates
        </Badge>
   )
}