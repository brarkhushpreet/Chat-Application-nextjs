import { currentProfile } from '@/lib/current-profile'
import { db } from '@/lib/db'
import { redirectToSignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import React from 'react'

const channelIdPage = async (

    {params}:{params:{channelId:string,serverId:string}}
) => {
    const profile= await currentProfile();

    if(!profile){
        return redirectToSignIn();
    }


    const channel= await db.channel.findUnique({
      where:{
        id:params.channelId,
      }
    })

    const member= await db.member.findUnique({
        where:{
            serverId:params.serverId,
            id:profile.id,
        }
    })

    

  return (
    <div className="bg-white dark:bg-[#313338] flex flex-col h-full">
       <div>hello, {profile?.name}</div>
       <div>{channel?.name}</div>
       <div>{channel?.type}</div>
    </div>
    
  )
}

export default channelIdPage