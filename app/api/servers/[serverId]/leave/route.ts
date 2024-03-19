import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(

    req:Request,
    {params}:{params:{serverId:string}}
){
   try {
    const profile= await currentProfile();
    const {serverId}=params;
    if(!profile){
        return new NextResponse("Unauthorized",{status:401});

    }
    if(!serverId){
        return new NextResponse("Server Id missing",{status:400});
    }
    const server = await db.server.update({
        where:{
            id:serverId,
            profileId:{
                not:profile.id
            },
            members:{
                some:{
                    profileId:profile.id
                }
            }
        },
        data:{
            members:{
                deleteMany:{
                    profileId:profile.id
                }
            
            }
        }
    })
    return NextResponse.json(server);
    
   } catch (error) {
    console.log("[Leave_Server_Errro]",error);
    return new NextResponse("Internal Server Error",{status:500});
    
   }
}