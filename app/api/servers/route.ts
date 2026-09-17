import { currentProfile } from "@/lib/current-profile";

import { db } from "@/lib/db";
import {  NextResponse } from "next/server";
import { MemberRole } from "@prisma/client";

export async function  POST(req:Request){
    try {
        const body = await req.json();
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const imageUrl =
            typeof body.imageUrl === "string" && body.imageUrl.trim()
                ? body.imageUrl
                : "/default-space.svg";
        const profile= await currentProfile();
        if(!profile){
            return new NextResponse("Unauthorized",{status:401});
        }
        if(!name){
            return new NextResponse("Space name is required",{status:400});
        }

        const server= await db.server.create({
            data:{
                profileId:profile.id,
                name,
                imageUrl,
                inviteCode: crypto.randomUUID(),
                channels:{
                    create:[
                         {name:"general",profileId:profile.id}
                    ]
                },
                members:{
                    create:[
                        {profileId:profile.id, role:MemberRole.ADMIN}
                    ]
                }    

            }
        })
        return NextResponse.json(server);
        
    } catch (error) {
        console.log("[SERVERS_POST]",error);
        return new NextResponse("Internal Server Error",{status:500});
        
    }
}
