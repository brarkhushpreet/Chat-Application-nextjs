import { cn } from "@/lib/utils";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface userAvatarProps{
    src?:string;
    className?:string;
}
export const UserAvatar=(
    {src,className}:userAvatarProps)=>{
    
        return(
            <Avatar className={cn(
              "h-7 w-7 md:h-10 md:w-10",
              className             

            )}>
                <AvatarImage src={src} className="object-cover" />
                <AvatarFallback className="bg-[#7567ff]/12 text-[#6959f6] dark:text-[#a39bff]">
                  <UserRound className="h-1/2 w-1/2" />
                </AvatarFallback>
            </Avatar>
        )

}
