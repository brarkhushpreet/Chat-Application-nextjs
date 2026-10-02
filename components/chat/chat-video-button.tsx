"use client";

import qs from "query-string";
import { usePathname, useSearchParams } from "next/navigation";
import { LoaderCircle, Video, VideoOff } from "lucide-react";
import { useNavigationFeedback } from "@/components/provider/navigation-feedback";


import { ActionTooltip } from "@/components/action-tooltip";

export const ChatVideoButton = () => {
  const pathname = usePathname();
  const { navigate, pendingHref } = useNavigationFeedback();
  const searchParams = useSearchParams();

  const isVideo = searchParams?.get("video");

  const onClick = () => {
    const url = qs.stringifyUrl({
      url: pathname || "",
      query: {
        video: isVideo ? undefined : true,
      }
    }, { skipNull: true });

    navigate(url, isVideo ? "Returning to chat…" : "Opening video call…");
  }
  
  const pending = Boolean(pendingHref && pendingHref.split("?")[0] === pathname);
  const Icon = pending ? LoaderCircle : isVideo ? VideoOff : Video;
  const tooltipLabel = isVideo ? "End video call" : "Start video call";

  return (
    <ActionTooltip side="bottom" label={tooltipLabel}>
      <button type="button" disabled={pending} aria-busy={pending} aria-label={pending ? "Opening…" : tooltipLabel} onClick={onClick} className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-black/[0.035] text-black/45 transition hover:bg-[#7567ff]/10 hover:text-[#6959f6] dark:bg-white/[0.05] dark:text-white/45 dark:hover:text-[#a39bff]">
        <Icon className={`h-4 w-4 ${pending ? "motion-safe:animate-spin" : ""}`} />
      </button>
    </ActionTooltip>
  )
}
