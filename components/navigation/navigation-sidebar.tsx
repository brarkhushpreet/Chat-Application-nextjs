import { currentProfile } from "@/lib/current-profile"
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import NavigationAction from "./navigation-action";
import { ScrollArea } from "../ui/scroll-area";
import { ModeToggle } from "../mode-toggle";
import { NavigationItem } from "./navigation-item";
import { UserAvatar } from "../user-avatar";
import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";


const NavigationSidebar = async () => {
    const profile= await currentProfile();
    if(!profile){
        return redirect("/");
    }
    const servers = await db.server.findMany({
        where:{
            members:{
                some:{
                    profileId:profile.id
                }
            }
        }
    })
  return (
    <aside className="space-rail flex h-full w-full flex-col items-center border-r py-4 text-foreground">
        <BrandMark className="mb-6 h-12 w-12" />
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Spaces</p>
        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="space-y-3 py-3">
            {servers.map((server)=>(
                <div key={server.id}>
                    <NavigationItem id={server.id} name={server.name} imageUrl={server.imageUrl} />
                </div>
            ))}
          </div>
        </ScrollArea>
        <div className="mt-3 flex flex-col items-center gap-y-3 border-t border-black/[0.08] pt-4 dark:border-white/[0.07]" >
            <NavigationAction/>
            <ModeToggle/>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="group relative flex h-11 w-11 items-center justify-center rounded-[16px] ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:ring-[#7567ff]/45 dark:ring-white/10 dark:hover:ring-[#8a7fff]/50"
              >
                <UserAvatar src={profile.imageUrl} className="h-10 w-10 rounded-[15px]" />
                <span className="absolute inset-0 flex items-center justify-center rounded-[15px] bg-[#171923]/75 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  <LogOut className="h-4 w-4" />
                </span>
              </button>
            </form>
        </div>
    </aside>
  )
}

export default NavigationSidebar
