import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { redirectToSignIn } from "@clerk/nextjs";

interface memberidPageProps{
    params:{
        serverId:string;
        channelId:string;
        memberId:string;
    },
}
const memberIdPage =  async (
    {params}:memberidPageProps
) => {

    const profile= await currentProfile();
    if(!profile){
        return redirectToSignIn();
    }

    const currentMember= await db.member.findFirst({
        where:{
            profileId:profile.id,
            serverId:params.serverId,
        },
        include:{
            profile:true,
        }
    })

    const member= await db.member.findUnique({
        where:{
            id:params.memberId,
        },
        include:{
            profile:true,
        }
    })

  return (
    <div>talk to {member?.profile?.name}</div>
  )
}

export default memberIdPage