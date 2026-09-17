import { Menu } from "lucide-react"
import { Button } from "./ui/button"
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet"
import NavigationSidebar from "./navigation/navigation-sidebar"
import ServerSidebar from "./server/server-sidebar"


export const MobileToggle =(
   { serverId}:{serverId:string}
)=>{
   
 return (
    <Sheet>
        <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
                <Menu/>
            </Button>
        </SheetTrigger>
        <SheetContent  side="left" className="flex gap-0 p-0">
          <div className="w-[84px]">
            <NavigationSidebar/>
          </div>
          <ServerSidebar serverId={serverId} />
        </SheetContent>
    </Sheet>
 )

}
