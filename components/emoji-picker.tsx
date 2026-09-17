"use client";

import { Smile } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EmojiPickerProps {
  onChange: (value: string) => void;
}

export const EmojiPicker = ({
  onChange,
}: EmojiPickerProps) => {
  const emojis = [
    "😀", "😄", "😂", "🥹", "😊", "😍", "🤩", "😎",
    "🤔", "🫡", "🤝", "👏", "🙌", "👍", "🎉", "✨",
    "🔥", "💡", "🚀", "💜", "✅", "👀", "💯", "🌱",
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Add an emoji" className="flex h-9 w-9 items-center justify-center rounded-xl text-black/35 transition hover:bg-black/[0.04] hover:text-black/60 dark:text-white/35 dark:hover:bg-white/[0.06] dark:hover:text-white/60">
        <Smile
          className="h-4 w-4"
        />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="top"
        align="end"
        sideOffset={12}
        className="mb-1 w-64 rounded-2xl border-black/[0.06] bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#181b23]/95"
      >
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-black/35 dark:text-white/35">Quick reactions</p>
        <div className="grid grid-cols-8 gap-1">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-lg transition hover:scale-110 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
