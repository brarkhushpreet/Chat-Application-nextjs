"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Member, MemberRole, Profile } from "@prisma/client";
import { Check, CheckCheck, Edit, FileIcon, ShieldAlert, ShieldCheck, Trash } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { ActionTooltip } from "@/components/action-tooltip";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useModal } from "@/hooks/use-modal-store";
import { startConversation } from "@/lib/start-conversation";

interface ChatItemProps {
  id: string;
  content: string;
  member: Member & {
    profile: Profile;
  };
  timestamp: string;
  fileUrl: string | null;
  deleted: boolean;
  currentMember: Member;
  isUpdated: boolean;
  deliveredAt: Date | string | null;
  readAt: Date | string | null;
  socketUrl: string;
  socketQuery: Record<string, string>;
};

const roleIconMap = {
  "GUEST": null,
  "MODERATOR": <ShieldCheck className="h-4 w-4 ml-2 text-indigo-500" />,
  "ADMIN": <ShieldAlert className="h-4 w-4 ml-2 text-rose-500" />,
}

const formSchema = z.object({
  content: z.string().min(1),
});

export const ChatItem = ({
  id,
  content,
  member,
  timestamp,
  fileUrl,
  deleted,
  currentMember,
  isUpdated,
  deliveredAt,
  readAt,
  socketUrl,
  socketQuery
}: ChatItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { onOpen } = useModal();
  const params = useParams();
  const router = useRouter();

  const onMemberClick = async () => {
    if (member.id === currentMember.id) {
      return;
    }

    const serverId = String(params?.serverId);
    await startConversation(serverId, member.id);
    router.push(`/servers/${serverId}/conversations/${member.id}`);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEditing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: content
    }
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const url = qs.stringifyUrl({
        url: `${socketUrl}/${id}`,
        query: socketQuery,
      });

      await axios.patch(url, values);

      form.reset();
      setIsEditing(false);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    form.reset({
      content: content,
    })
  }, [content, form]);

  const fileType = fileUrl?.split(".").pop();

  const isAdmin = currentMember.role === MemberRole.ADMIN;
  const isModerator = currentMember.role === MemberRole.MODERATOR;
  const isOwner = currentMember.id === member.id;
  const canDeleteMessage = !deleted && (isAdmin || isModerator || isOwner);
  const canEditMessage = !deleted && isOwner && !fileUrl;
  const isPDF = fileType === "pdf" && fileUrl;
  const isImage = !isPDF && fileUrl;
  const isRead = Boolean(readAt);
  const isDelivered = Boolean(deliveredAt);

  return (
    <div className={cn(
      "group relative flex w-full px-4 py-2.5 md:px-6",
      isOwner ? "justify-end" : "justify-start",
    )}>
      <div className={cn(
        "flex min-w-0 max-w-[92%] items-end gap-2.5 md:max-w-[72%]",
        isOwner && "flex-row-reverse",
      )}>
        <button type="button" onClick={onMemberClick} disabled={isOwner} aria-label={`Message ${member.profile.name}`} className="mb-5 shrink-0 rounded-full transition hover:opacity-80 disabled:cursor-default">
          <UserAvatar src={member.profile.imageUrl} className="h-9 w-9 ring-2 ring-black/[0.04] md:h-10 md:w-10 dark:ring-white/[0.06]" />
        </button>
        <div className={cn("flex min-w-0 flex-col", isOwner ? "items-end" : "items-start")}>
          <div className={cn("flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-1", isOwner && "flex-row-reverse")}>
            <div className={cn("flex items-center", isOwner && "flex-row-reverse")}>
              <button type="button" onClick={onMemberClick} disabled={isOwner} className="break-words text-left text-sm font-semibold tracking-tight hover:text-primary disabled:cursor-default">
                {isOwner ? "You" : member.profile.name}
              </button>
              <ActionTooltip label={member.role}>
                {roleIconMap[member.role]}
              </ActionTooltip>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {timestamp}
            </span>
          </div>
          {isImage && (
            <a 
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "relative mt-1.5 flex aspect-square h-48 w-48 items-center overflow-hidden rounded-2xl border bg-secondary shadow-sm",
                isOwner ? "border-[#7567ff]/45" : "border-black/[0.06] dark:border-white/[0.08]",
              )}
            >
              <Image
                unoptimized
                src={fileUrl}
                alt={content}
                fill
                className="object-cover"
              />
            </a>
          )}
          {isPDF && (
            <div className={cn(
              "relative mt-1.5 flex items-center rounded-2xl p-3 shadow-sm",
              isOwner ? "bg-[#7567ff] text-white" : "bg-[#f0f2f6] dark:bg-[#191f2a]",
            )}>
              <FileIcon className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
              <a 
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                PDF attachment
              </a>
            </div>
          )}
          {!fileUrl && !isEditing && (
            <p className={cn(
              "mt-1 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-4 py-2.5 text-sm leading-6",
              isOwner
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "message-received rounded-bl-md border",
              deleted && "bg-transparent text-xs italic text-zinc-500 shadow-none ring-1 ring-black/[0.06] dark:text-zinc-400 dark:ring-white/[0.08]"
            )}>
              {content}
              {isUpdated && !deleted && (
                <span className={cn(
                  "mx-2 text-[10px]",
                  isOwner ? "text-white/65" : "text-zinc-500 dark:text-zinc-400",
                )}>
                  (edited)
                </span>
              )}
            </p>
          )}
          {!fileUrl && isEditing && (
            <Form {...form}>
              <form 
                className="flex w-full min-w-0 items-center gap-x-2 pt-2 md:min-w-[24rem]"
                onSubmit={form.handleSubmit(onSubmit)}>
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <div className="relative w-full">
                            <Input
                              disabled={isLoading}
                              className="p-2 bg-zinc-200/90 dark:bg-zinc-700/75 border-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-zinc-600 dark:text-zinc-200"
                              placeholder="Edited message"
                              {...field}
                            />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button disabled={isLoading} size="sm" variant="primary">
                    Save
                  </Button>
              </form>
              <span className="text-[10px] mt-1 text-zinc-400">
                Press escape to cancel, enter to save
              </span>
            </Form>
          )}
          {isOwner && !deleted && !isEditing && (
            <span className={cn(
              "mt-1 flex items-center gap-1 px-1 text-[11px] font-medium",
              isRead ? "text-[#6557e8] dark:text-[#9f96ff]" : "text-muted-foreground",
            )}>
              {isRead || isDelivered
                ? <CheckCheck className="h-3.5 w-3.5" />
                : <Check className="h-3.5 w-3.5" />}
              {isRead ? "Read" : isDelivered ? "Delivered" : "Sent"}
            </span>
          )}
        </div>
      </div>
      {canDeleteMessage && (
        <div className={cn(
          "absolute -top-3 flex items-center gap-x-1 rounded-xl border border-[#dfe3eb] bg-white p-1 shadow-sm md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto dark:border-white/[0.08] dark:bg-[#181d26]",
          isOwner ? "right-16" : "left-16",
        )}>
          {canEditMessage && (
            <ActionTooltip label="Edit">
              <button type="button" aria-label="Edit message" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setIsEditing(true)}
              >
                <Edit className="h-4 w-4" />
              </button>
            </ActionTooltip>
          )}
          <ActionTooltip label="Delete">
            <button type="button" aria-label="Delete message" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onOpen("deleteMessage", { 
                apiUrl: `${socketUrl}/${id}`,
                query: socketQuery,
               })}
            >
              <Trash className="h-4 w-4" />
            </button>
          </ActionTooltip>
        </div>
      )}
    </div>
  )
}
