import { ChatHeader } from '@/components/chat/chat-header';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { MediaRoom } from '@/components/media-room';
import { currentProfile } from '@/lib/current-profile'
import { db } from '@/lib/db'
import { ChannelType } from '@prisma/client';
import { redirect } from 'next/navigation';


interface channelIdPageProps{
    params: Promise<{
        channelId:string;
        serverId:string;
    }>;
}

const channelIdPage = async (

    {params}:channelIdPageProps
) => {
    const { channelId, serverId } = await params;
    const profile= await currentProfile();

    if(!profile){
        return redirect("/sign-in");
    }


    const channel= await db.channel.findUnique({
      where:{
        id: channelId,
      }
    })

    const member= await db.member.findFirst({
        where:{
            serverId,
            profileId:profile.id,
        }
    })
    if(!channel || !member){
      return redirect("/");
    }

    

  return (
    <div className="conversation-panel flex h-full flex-col overflow-hidden rounded-2xl border">
      
       <ChatHeader
       serverId={serverId}
       name={channel?.name}
       type="channel"
       />
      {channel.type === ChannelType.TEXT && (
        <>
      <ChatMessages
            member={member}
            name={channel.name}
            chatId={channel.id}
            type="channel"
            apiUrl="/api/messages"
            socketUrl="/api/socket/messages"
            socketQuery={{
              channelId: channel.id,
              serverId: channel.serverId,
            }}
            paramKey="channelId"
            paramValue={channel.id}
          />
       
       <ChatInput
        apiUrl="/api/socket/messages"
        type="channel"
        name={channel?.name}
        query={{
          channelId:channel.id,
          serverId,
        }
      }
      />
      </>
      )}
       {channel.type === ChannelType.AUDIO && (
        <MediaRoom
          chatId={channel.id}
          video={false}
          audio={true}
          roomKind="channel"
        />
      )}
      {channel.type === ChannelType.VIDEO && (
        <MediaRoom
          chatId={channel.id}
          video={true}
          audio={true}
          roomKind="channel"
        />
      )}
    </div>
    
  )
}

export default channelIdPage
