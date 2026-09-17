import { MessageCircleMore } from "lucide-react";
import { MobileToggle } from "../mobile-toggle";
import { UserAvatar } from "../user-avatar";
import { SocketIndicator } from "../socket-indicator";
import { ChatVideoButton } from "./chat-video-button";


interface chatHeaderProps{
    serverId:string;
    name:string;
    type:"channel"|"conversation"
    imageUrl?:string;
}
export const ChatHeader=(
    {serverId,name,type,imageUrl}:chatHeaderProps
)=>{
    return(
        <header className="conversation-header flex h-[72px] shrink-0 items-center border-b px-4 md:px-6">
            <MobileToggle serverId={serverId}/>
            {type==="channel" &&(
                <span className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#7567ff]/10 text-[#6b5cf5] dark:text-[#9c93ff]">
                  <MessageCircleMore className="h-4 w-4"/>
                </span>
            )}
            {type==="conversation" &&(
                <UserAvatar
                src={imageUrl}
                className="mr-3 h-9 w-9 ring-2 ring-black/5 md:h-9 md:w-9 dark:ring-white/10"
                />
            )}
             <div className="min-w-0 flex-1">
               <p className="truncate text-base font-semibold tracking-tight text-foreground">{name}</p>
               <p className="text-xs text-muted-foreground">{type === "channel" ? "Shared room" : "Private conversation"}</p>
             </div>
             <div className="ml-auto flex shrink-0 items-center pl-3">
             {type === "conversation" && (
               <ChatVideoButton />
               )}
 
                <SocketIndicator/>
             </div>
        </header>
    )
}
