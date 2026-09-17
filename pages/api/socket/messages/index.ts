import { currentProfilePages } from "@/lib/current-profile-pages";
import { db } from "@/lib/db";
import { NextApiResponseServerIo } from "@/types";
import { NextApiRequest } from "next";
import { emitChatEvent, emitUserEvent, isUserOnline } from "@/lib/realtime";

export default async function handler(
    req:NextApiRequest,res:NextApiResponseServerIo
){
    if(req.method!="POST"){
        return res.status(405).json({error : "method not allowed"});
    }

    try {

        const profile= await currentProfilePages(req, res);
        const {content,fileUrl}= req.body;
        const {serverId,channelId}=req.query;

        if(!profile){
            return res.status(401).json({error:"Unauthorized access"});
        }
        if(!serverId){
            return res.status(400).json({error:"Server Id missing"});
        }
        
        if(!channelId){
            return res.status(400).json({error:"Channel Id missing"});
        }
        if(!content){
            return res.status(400).json({error:"Content missing"});
        }
        
        const server= await db.server.findFirst({
            where:{
                id:serverId as string,
                members:{
                    some:{
                        profileId:profile.id 
                    }
                }
            },
            include:{
                members:{
                    include:{
                        profile:true,
                    }
                }
            }
        });
        if(!server){
            return res.status(404).json({error:"Server not found"});
        }

        const channel= await db.channel.findFirst({
            where:{
                id:channelId as string,
                serverId:serverId as string,
            }
        })

        if(!channel){
            return res.status(404).json({error:"Channel not found"});
        }

        const member= server.members.find((member)=>member.profileId===profile.id);

        if(!member){
            return res.status(404).json({error:"member not found"});
        }

        const recipientUserIds = server.members
            .filter((serverMember) => serverMember.id !== member.id)
            .map((serverMember) => serverMember.profile.userId);
        const deliveredAt = (await Promise.all(recipientUserIds.map(isUserOnline))).some(Boolean) ? new Date() : null;

        const message= await db.message.create({
            data:{
                content,
                fileUrl,
                channelId:channelId as string,
                memberId:member.id as string,
                deliveredAt,
            },

            include:{
                member:{
                    include:{
                        profile:true,
                    }
                }
            }
        });

        const key=`chat:${channelId}:messages`;

        for (const userId of recipientUserIds) {
            await emitUserEvent(userId, "sidebar:message", {
                kind: "channel",
                roomId: channelId as string,
                messageId: message.id,
                createdAt: message.createdAt,
            });
        }

        await emitChatEvent(channelId as string, key, message);

        return res.status(200).json(message);


    } catch (error) {
        console.log("MESSAGES_POST_ERROR",error);
        return res.status(500).json({error:"Internal Server error"})
        
    }

}
