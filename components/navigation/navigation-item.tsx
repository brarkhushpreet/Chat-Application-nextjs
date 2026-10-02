"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useNavigationFeedback } from "@/components/provider/navigation-feedback";

import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/action-tooltip";

interface NavigationItemProps {
  id: string;
  imageUrl: string;
  name: string;
};

export const NavigationItem = ({
  id,
  imageUrl,
  name
}: NavigationItemProps) => {
  const params = useParams();
  const { navigate, pendingHref } = useNavigationFeedback();
  const pending = pendingHref === `/servers/${id}`;

  const onClick = () => {
    navigate(`/servers/${id}`, `Opening ${name}…`);
  }

  return (
    <ActionTooltip
      side="right"
      align="center"
      label={name}
    >
      <button
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className="group relative flex w-full items-center justify-center"
      >
        <div className={cn(
          "absolute left-1.5 h-2 w-2 rounded-full bg-[#7567ff] opacity-0 transition-all",
          params?.serverId !== id && "group-hover:opacity-50",
          params?.serverId === id && "opacity-100 shadow-[0_0_0_5px_rgba(117,103,255,.12)]"
        )} />
        <div className={cn(
          "relative flex h-12 w-12 overflow-hidden rounded-[18px] ring-1 ring-black/5 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg dark:ring-white/10",
          params?.serverId === id && "-translate-y-0.5 rounded-[14px] ring-2 ring-[#7567ff]/50 shadow-xl shadow-[#7567ff]/10"
        )}>
          <Image
          unoptimized
            fill
            src={imageUrl}
            alt={name}
            className="object-cover"
          />
          {pending && <span className="absolute inset-0 flex items-center justify-center bg-card/80"><LoaderCircle className="h-5 w-5 text-primary motion-safe:animate-spin" /></span>}
        </div>
      </button>
    </ActionTooltip>
  )
}
