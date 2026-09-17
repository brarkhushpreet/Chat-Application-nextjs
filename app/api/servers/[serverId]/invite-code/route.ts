import { currentProfile } from "@/lib/current-profile";

import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(
    req:Request,
    { params }: { params: Promise<{ serverId: string }> }
){
    try {
        const { serverId } = await params;
        const profile= await currentProfile();
        if(!profile){
            return new NextResponse("Unauthorized",{status:400});
        }
        const server= await db.server.update({
            where:{
                id: serverId,
                profileId:profile.id,
            },
            data:{
                inviteCode: crypto.randomUUID()
            }
        })
        return NextResponse.json(server);
    } catch (error) {
        console.log("[Server Error]",error);
        return new NextResponse("Internal Error",{status:500})
        
    }
}
