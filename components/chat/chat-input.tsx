"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem } from "../ui/form";
import { LoaderCircle, Plus, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { LoadingStatus } from "@/components/loading-status";
import { Input } from "../ui/input";
import qs from "query-string";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import { EmojiPicker } from "../emoji-picker";

interface ChatInputProps {
  apiUrl: string;
  query: Record<string, string>;
  name: string;
  type: "conversation" | "channel";
}

const formSchema = z.object({
  content: z.string().min(1),
});


export const ChatInput = (
  { apiUrl, 
    query, 
    name, 
    type }: ChatInputProps) => {

  const {onOpen}=useModal();
  const router= useRouter();
  const [sendError, setSendError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setSendError(null);
    try {
        const url=qs.stringifyUrl({
            url:apiUrl,
            query,
        })
        await axios.post(url,values);
        form.reset();
        router.refresh();
    } catch {
        setSendError("Message could not be sent. Your draft is saved here; try again.");
    }
   
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative px-4 pb-5 pt-2 md:px-5">
                  <div className="relative flex items-center rounded-2xl border border-[#cfd5e1] bg-white shadow-sm px-3 transition focus-within:border-[#7567ff]/45 focus-within:ring-4 focus-within:ring-[#7567ff]/[0.07] dark:border-white/[0.08] dark:bg-[#191e28]">
                  <button
                    type="button"
                    aria-label="Attach a file" onClick={()=>onOpen("messageFile",{apiUrl,query})}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-[#7567ff]/10 hover:text-[#6959f6] dark:text-white/35"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <Input
                    disabled={isLoading}
                    className="h-12 flex-1 border-0 bg-transparent px-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-white/70 dark:placeholder:text-white/30"
                    placeholder={`Message ${
                      type=== "conversation" ? name : "#" + name
                    }`}
                    {...field}
                  />

                    <div className="flex items-center gap-1">
                    <EmojiPicker
                      onChange={(emoji: string) => { if (!isLoading) field.onChange(`${field.value} ${emoji}`); }}
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      aria-label={isLoading ? "Sending message" : "Send message"}
                      aria-busy={isLoading}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                      {isLoading ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    </button>
                  </div>
                  </div>
                  {isLoading && <div className="pt-2"><LoadingStatus label="Sending message…" hint="Waiting for server confirmation. Please don't resend yet." /></div>}
                  {sendError && <p role="alert" className="pt-2 text-xs text-destructive">{sendError}</p>}
                </div>
              </FormControl>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
