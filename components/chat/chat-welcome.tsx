import { MessageCircleMore, Sparkles } from "lucide-react";

interface ChatWelcomeProps {
  name: string;
  type: "channel" | "conversation";
};

export const ChatWelcome = ({
  name,
  type
}: ChatWelcomeProps) => {
  return (
    <div className="conversation-welcome soft-in mx-5 mb-6 mt-6 max-w-lg rounded-xl border p-5">
      {type === "channel" && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MessageCircleMore className="h-6 w-6" />
        </div>
      )}
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6959f6] dark:text-[#9c93ff]">
        <Sparkles className="h-3.5 w-3.5" /> Fresh start
      </div>
      <p className="break-words text-xl font-semibold tracking-tight md:text-2xl">
        {type === "channel" ? "Welcome to " : "Your conversation with "}{name}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {type === "channel"
          ? "A shared space for ideas, updates, and the little things in between."
          : `Messages shared here stay between you and ${name}.`
        }
      </p>
    </div>
  )
}
