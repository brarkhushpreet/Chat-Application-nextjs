"use client";

import qs from "query-string";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Video, VideoOff } from "lucide-react";


import { ActionTooltip } from "@/components/action-tooltip";

export const ChatVideoButton = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isVideo = searchParams?.get("video");

  const onClick = () => {
    const url = qs.stringifyUrl({
      url: pathname || "",
      query: {
        video: isVideo ? undefined : true,
      }
    }, { skipNull: true });

    router.push(url);
  }
  
  const Icon = isVideo ? VideoOff : Video;
  const tooltipLabel = isVideo ? "End video call" : "Start video call";

  return (
    <ActionTooltip side="bottom" label={tooltipLabel}>
      <button type="button" aria-label={tooltipLabel} onClick={onClick} className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-black/[0.035] text-black/45 transition hover:bg-[#7567ff]/10 hover:text-[#6959f6] dark:bg-white/[0.05] dark:text-white/45 dark:hover:text-[#a39bff]">
        <Icon className="h-4 w-4" />
      </button>
    </ActionTooltip>
  )
}
