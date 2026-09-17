"use client"

import { Search } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { startConversation } from "@/lib/start-conversation";

interface ServerSearchProps{
    data:{
        label:string;
        type:"channel"|"member",
        data:{
            icon:React.ReactNode;
            name:string;
            id:string;
        } []| undefined
    } []
}

const ServerSearch=(
    {data}:ServerSearchProps
)=>{

    const[open ,setOpen]=useState(false);
    const params= useParams();
    const router= useRouter();

    useEffect(()=>{
        const down=(e:KeyboardEvent)=>{
            if(e.key==="k" && (e.metaKey || e.ctrlKey)){
                e.preventDefault();
                setOpen((open)=>!open);
            }
        }
        document.addEventListener("keydown",down);
        return ()=> document.removeEventListener("keydown",down);
    },[]);

    const onClick=async ({id,type}:{id:string,type:"channel"|"member"})=>{
        setOpen(false);
        if(type==="member"){
            await startConversation(String(params?.serverId), id);
            return router.push(`/servers/${params?.serverId}/conversations/${id}`)
        }
        if(type==="channel"){
            return router.push(`/servers/${params?.serverId}/channels/${id}`)
        }
    }

    return (
        <>
        <button onClick={()=>setOpen(true)}
        className="group flex w-full items-center gap-2 rounded-xl border border-[#e0e4ec] bg-white px-3 py-2.5 transition hover:border-[#cfd4df] dark:border-white/[0.07] dark:bg-[#171c25] dark:hover:border-white/[0.12]"
        >
            <Search className="h-4 w-4 text-muted-foreground"/>
            <p 
             className="text-sm font-medium text-muted-foreground transition group-hover:text-foreground"
             >
                Jump to…
            </p>

            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded-md border border-black/[0.06] bg-black/[0.03] px-1.5 font-mono text-[11px] font-medium text-black/35 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white/35">
                <span className="text-xs">Ctrl</span>K
            </kbd>

        </button>
        <CommandDialog open={open} onOpenChange={setOpen}>
         <CommandInput placeholder="Search rooms and people"/>
         <CommandList>
            <CommandEmpty>
                No Results Found
            </CommandEmpty>
            {data.map(({label, type,data})=>{
                if(!data?.length) return null;
                return (
                    <CommandGroup key={label} heading={label}>
                         {data?.map(({id,icon,name})=>{
                            return(
                                <CommandItem key={id} onSelect={()=> onClick({id,type})}>
                                    {icon}
                                    <span>{name}</span>
                                </CommandItem>
                            )
                         })}

                    </CommandGroup>
                )

            })}
         </CommandList>
        </CommandDialog>

        </>
    )
}
export default ServerSearch;
