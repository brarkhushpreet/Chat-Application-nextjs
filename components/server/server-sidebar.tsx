import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ChannelType, MemberRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { ServerHeader } from "./server-header";
import { ScrollArea } from "../ui/scroll-area";
import ServerSearch from "./server-search";
import { AudioLines, MessageCircleMore, ShieldAlert, ShieldCheck, Video } from "lucide-react";
import { Separator } from "../ui/separator";
import { ServerSection } from "./server-section";
import { ServerChannel } from "./server-channel";
import { ServerMember } from "./server-member";
import { ServerConversations } from "./server-conversations";

interface ServerSidebarProps {
  serverId: string;
}

const iconMap = {
  [ChannelType.TEXT]: <MessageCircleMore className="h-4 w-4 mr-2 " />,
  [ChannelType.AUDIO]: <AudioLines className="h-4 w-4 mr-2 " />,
  [ChannelType.VIDEO]: <Video className="h-4 w-4 mr-2 " />,
};

const roleIconMap = {
  [MemberRole.GUEST]: null,
  [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
  [MemberRole.MODERATOR]: (
    <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />
  ),
};
const ServerSidebar = async ({ serverId }: ServerSidebarProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/");
  }

  const server = await db.server.findUnique({
    where: {
      id: serverId,
    },
    include: {
      channels: {
        orderBy: {
          createdAt: "asc",
        },
      },
      members: {
        include: {
          profile: true,
        },
        orderBy: {
          role: "asc",
        },
      },
    },
  });

  if (!server) {
    return redirect("/");
  }

  const currentMember = server.members.find(
    (member) => member.profileId === profile.id
  );
  if (!currentMember) {
    return redirect("/");
  }

  const conversations = await db.conversation.findMany({
    where: {
      OR: [
        { memberOneId: currentMember.id },
        { memberTwoId: currentMember.id },
      ],
    },
    include: {
      memberOne: { include: { profile: true } },
      memberTwo: { include: { profile: true } },
    },
  });

  const [channelReadStates, conversationReadStates] = await Promise.all([
    db.channelReadState.findMany({
      where: { memberId: currentMember.id },
      select: { channelId: true, lastReadAt: true },
    }),
    db.conversationReadState.findMany({
      where: { memberId: currentMember.id },
      select: { conversationId: true, lastReadAt: true },
    }),
  ]);
  const channelReadMap = new Map(
    channelReadStates.map((state) => [state.channelId, state.lastReadAt]),
  );
  const conversationReadMap = new Map(
    conversationReadStates.map((state) => [state.conversationId, state.lastReadAt]),
  );

  const textChannels = server.channels.filter(
    (channel) => channel.type === ChannelType.TEXT
  );
  const audioChannels = server.channels.filter(
    (channel) => channel.type === ChannelType.AUDIO
  );
  const videoChannels = server.channels.filter(
    (channel) => channel.type === ChannelType.VIDEO
  );
  const members = server.members.filter(
    (member) => member.profileId !== profile.id
  );
  const role = currentMember.role;
  const [channelUnreadCounts, conversationUnreadCounts] = await Promise.all([
    Promise.all(
      textChannels.map(async (channel) => [
        channel.id,
        await db.message.count({
          where: {
            channelId: channel.id,
            memberId: { not: currentMember.id },
            deleted: false,
            createdAt: { gt: channelReadMap.get(channel.id) ?? new Date(0) },
          },
        }),
      ] as const),
    ),
    Promise.all(
      conversations.map(async (conversation) => [
        conversation.id,
        await db.directMessage.count({
          where: {
            conversationId: conversation.id,
            memberId: { not: currentMember.id },
            deleted: false,
            createdAt: {
              gt: conversationReadMap.get(conversation.id) ?? new Date(0),
            },
          },
        }),
      ] as const),
    ),
  ]);
  const channelUnreadMap = new Map(channelUnreadCounts);
  const conversationUnreadMap = new Map(conversationUnreadCounts);
  const conversationItems = conversations.map((conversation) => ({
    conversation,
    unreadCount: conversationUnreadMap.get(conversation.id) ?? 0,
  }));
  const conversationStateKey = conversationItems
    .map(({ conversation, unreadCount }) => `${conversation.id}:${unreadCount}`)
    .join("|");

  return (
    <aside className="space-sidebar flex h-full w-full flex-col border-r px-3 text-foreground">
      <div className="shrink-0 border-b border-border py-2">
        <ServerHeader server={server} role={role} />
      </div>

      <ScrollArea className="-ml-1 -mr-2 min-h-0 flex-1">
        <div className="pb-4 pl-1 pr-4">
        <div className="mt-3">
          <ServerSearch
            data={[
              {
                label: "Conversations",
                type: "channel",
                data: textChannels?.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: iconMap[channel.type],
                })),
              },
              {
                label: "Audio lounges",
                type: "channel",
                data: audioChannels?.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: iconMap[channel.type],
                })),
              },
              {
                label: "Huddle rooms",
                type: "channel",
                data: videoChannels?.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: iconMap[channel.type],
                })),
              },
              {
                label: "People",
                type: "member",
                data: members?.map((member) => ({
                  id: member.id,
                  name: member.profile.name,
                  icon: roleIconMap[member.role],
                })),
              },
            ]}
          />
        </div>
        <Separator className="my-5 bg-black/[0.06] dark:bg-white/[0.06]" />
        {!!textChannels?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.TEXT}
              role={role}
              label="Conversations"
            />
            <div className="space-y-[2px]">

            {textChannels.map((channel) => (
              <ServerChannel
              key={`${channel.id}:${channelUnreadMap.get(channel.id) ?? 0}`}
              channel={channel}
              initialUnreadCount={channelUnreadMap.get(channel.id) ?? 0}
              role={role}
              server={server}
              />
              ))}
            </div>
          </div>
        )}

        <ServerConversations
          key={`${server.id}:${conversationStateKey}`}
          currentMemberId={currentMember.id}
          initialConversations={conversationItems}
          serverId={server.id}
        />

        {!!audioChannels?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.AUDIO}
              role={role}
              label="Audio lounges"
            /><div className="space-y-[2px]">
            {audioChannels.map((channel) => (
              <ServerChannel
              key={channel.id}
              channel={channel}
              
                role={role}
                server={server}
                />
                ))}
              </div>
          </div>
        )}
        {!!videoChannels?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.VIDEO}
              role={role}
              label="Huddle rooms"
            />
            <div className="space-y-[2px]">

            {videoChannels.map((channel) => (
              <ServerChannel
              key={channel.id}
              channel={channel}
              role={role}
              server={server}
              />
              ))}
            </div>
          </div>
        )}
        {!!members?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="members"
              role={role}
              label="People"
              server={server}
            />
            <div className="space-y-[2px]">

            {members.map((member) => (
              <ServerMember    
               key={member.id}
               member={member}
               server={server}
              />
              ))}
            </div>
          </div>
        )}
        </div>
      </ScrollArea>
    </aside>
  );
};

export default ServerSidebar;
