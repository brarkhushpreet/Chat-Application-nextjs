"use client";

import { ServerWithMembersWithProfiles } from "@/types";
import { MemberRole } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  LogOut,
  PlusCircle,
  Settings,
  Trash,
  UserPlus,
  Users,
} from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";

interface ServerHeaderProps {
  server: ServerWithMembersWithProfiles;
  role?: MemberRole;
}
export const ServerHeader = ({ server, role }: ServerHeaderProps) => {
  const { onOpen } = useModal();
  const isAdmin = role === MemberRole.ADMIN;
  const isModerator = isAdmin || role === MemberRole.MODERATOR;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-2 focus-visible:ring-ring" asChild>
        <button type="button" className="group flex h-[60px] w-full items-center gap-3 rounded-xl border border-transparent px-3 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:border-border hover:bg-card hover:shadow-sm data-[state=open]:border-border data-[state=open]:bg-card data-[state=open]:shadow-sm">
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current space</span>
            <span className="mt-1 block truncate text-base font-bold tracking-tight">{server.name}</span>
          </span>
          <span className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground group-data-[state=open]:bg-muted group-data-[state=open]:text-foreground">
            <ChevronDown className="h-4 w-4 transition-transform duration-150 group-data-[state=open]:rotate-180" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 text-xs font-medium text-black dark:text-neutral-400 space-y-[2px]">
        {isModerator && (
          <DropdownMenuItem 
           onClick={()=> onOpen("invite",{server})}
            className="text-indigo-600 dark:text-indigo-400 px-3 py-2 text-sm cursor-pointer">
            Invite people
            <UserPlus className="h-4 w-4 ml-auto " />
          </DropdownMenuItem>
        )}

        {isAdmin && (
          <DropdownMenuItem 
          onClick={()=> onOpen("editServer",{server})}
          className=" px-3 py-2 text-sm cursor-pointer">
            Space settings
            <Settings className="h-4 w-4 ml-auto " />
          </DropdownMenuItem>
        )}

        {isAdmin && (
          <DropdownMenuItem
          onClick={()=> onOpen("members",{server})}
          className=" px-3 py-2 text-sm cursor-pointer">
            Manage people
            <Users className="h-4 w-4 ml-auto " />
          </DropdownMenuItem>
        )}

        {isModerator && (
          <DropdownMenuItem 
           onClick={()=> onOpen("createChannel")}
          className=" px-3 py-2 text-sm cursor-pointer">
            Create room
            <PlusCircle className="h-4 w-4 ml-auto " />
          </DropdownMenuItem>
        )}

        {isModerator && <DropdownMenuSeparator />}

        {isAdmin && (
          <DropdownMenuItem 
          onClick={()=> onOpen("deleteServer",{server})}
          className="text-rose-500 dark:text-rose-400 px-3 py-2 text-sm cursor-pointer">
            Delete space
            <Trash className="h-4 w-4 ml-auto " />
          </DropdownMenuItem>
        )}

        {!isAdmin && (
          <DropdownMenuItem
          onClick={()=> onOpen("leaveServer",{server})}
           className="text-rose-500 dark:text-rose-400 px-3 py-2 text-sm cursor-pointer">
            Leave space
            <LogOut className="h-4 w-4 ml-auto " />
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
