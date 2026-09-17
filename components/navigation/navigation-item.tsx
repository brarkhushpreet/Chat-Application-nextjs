"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";

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
  const router = useRouter();

  const onClick = () => {
    router.push(`/servers/${id}`);
  }

  return (
    <ActionTooltip
      side="right"
      align="center"
      label={name}
    >
      <button
        onClick={onClick}
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
        </div>
      </button>
    </ActionTooltip>
  )
}
