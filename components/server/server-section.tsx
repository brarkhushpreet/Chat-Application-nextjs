"use client"
import { ServerWithMembersWithProfiles } from "@/types";
import { ChannelType, MemberRole } from "@prisma/client";
import { ActionTooltip } from "../action-tooltip";
import { Plus, Settings } from "lucide-react";
import { useModal } from "@/hooks/use-modal-store";

interface serverSectionProps{
    label:string;
    role?:MemberRole;
    sectionType: "channels"|"members";
    channelType?:ChannelType;
    server?: ServerWithMembersWithProfiles;
}

export const ServerSection=({
    label,role,sectionType,channelType,server
}:serverSectionProps)=>{
    const {onOpen}=useModal();

    return (
        <div>
            <div className="flex items-center justify-between px-1 pb-2 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {label}
                </p>
                {role!==MemberRole.GUEST && sectionType==="channels" &&(
                    <ActionTooltip label="Create room" side="top">
                      <button 
                      aria-label="Create room" onClick={()=> onOpen("createChannel",{channelType})}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground">
                        <Plus className="h-4 w-4" />
                      </button>
                    </ActionTooltip>
                )}

                {role===MemberRole.ADMIN && sectionType==="members" &&(
                    <ActionTooltip label="Manage Members" side="top">
                      <button 
                      aria-label="Manage people" onClick={()=> onOpen("members",{server})}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground">
                        <Settings className="h-4 w-4" />
                      </button>
                    </ActionTooltip>
                )}


            </div>
        </div>
    )

}
