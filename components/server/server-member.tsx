"use client"

import { cn } from "@/lib/utils";
import { Member, MemberRole, Profile, Server } from "@prisma/client"
import { LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserAvatar } from "../user-avatar";
import { startConversation } from "@/lib/start-conversation";

interface serverMemberProps {
  member: Member & {profile:Profile};
  server:Server;
}

const roleIconMap={
[MemberRole.GUEST]:null,
[MemberRole.MODERATOR]:<ShieldCheck className="w-4 h-4 ml-2 text-indigo-500"/>,
[MemberRole.ADMIN]:<ShieldAlert className="w-4 h-4 ml-2 text-rose-500"/>,
}

export const ServerMember=({
member,
server,
}:serverMemberProps)=>{
    const [isStarting, setIsStarting] = useState(false);
    const router= useRouter();
    


    const icon= roleIconMap[member.role];

    const onClick = async () => {
      try {
        setIsStarting(true);
        await startConversation(server.id, member.id);
        router.push(`/servers/${server.id}/conversations/${member.id}`);
      } finally {
        setIsStarting(false);
      }
    }
  
 return (
   <button onClick={onClick} disabled={isStarting}
    className={cn(
        "group mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-foreground/[0.04] disabled:opacity-60 dark:hover:bg-white/[0.055]"
    )}
   >
    <UserAvatar 
    src={member.profile.imageUrl}
     className="h-8 w-8 ring-2 ring-white/50 md:h-8 md:w-8 dark:ring-white/10"
    />
    <p
    className={cn(
        "truncate text-sm font-semibold text-foreground/80 transition group-hover:text-foreground",
    )}
    >
        {member.profile.name}
    </p>
    {icon}
    {isStarting && <LoaderCircle className="ml-auto h-3.5 w-3.5 animate-spin" />}
   </button>
 )
}
