import ServerSidebar from "@/components/server/server-sidebar";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

const ServerIdLayout= async ({
    children,
    params,
}:{
    children:React.ReactNode;
    params: Promise<{ serverId: string }>;
})=>{
    const { serverId } = await params;
    const profile= await currentProfile();

    if(!profile){
        return redirect("/sign-in");
    }
    const server = await db.server.findUnique({
        where:{
            id: serverId,
            members:{
                some:{
                    profileId:profile.id
                }
            }
        }
    })
    if(!server){
        return redirect("/");
    }
    return (
        <div className="flex h-full min-w-0">
            <div className="relative z-20 flex h-full w-[264px] shrink-0 flex-col max-md:hidden">
                <ServerSidebar serverId={serverId}/>
            </div>
            <main className="relative z-10 h-full min-w-0 flex-1 p-2 lg:p-4">
               {children}
            </main>
        </div>
    )

}

export default ServerIdLayout;
