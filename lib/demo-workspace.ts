import { db } from "./db";
import {
  DEMO_EMAIL, DEMO_SERVER_ID, DEMO_USER_ID,
  demoPeople, demoChannels, demoMessages, demoDirectMessages,
} from "./demo";

const profileId = (key: string) => `nexus-demo-profile-${key}`;
const memberId = (key: string) => `nexus-demo-member-${key}`;

export async function ensureDemoWorkspace() {
  return db.$transaction(async (tx) => {
    // One transaction makes first-time setup atomic. Stable IDs and upserts
    // make later visits repeatable without overwriting any existing chats.
    const guest = await tx.user.upsert({
      where: { id: DEMO_USER_ID },
      update: {},
      create: { id: DEMO_USER_ID, name: "Portfolio Guest", email: DEMO_EMAIL },
    });

    for (const person of demoPeople) {
      await tx.profile.upsert({
        where: { id: profileId(person.key) },
        update: {},
        create: {
          id: profileId(person.key),
          userId: person.key === "guest" ? DEMO_USER_ID : `nexus-demo-person-${person.key}`,
          name: person.name,
          email: person.key === "guest" ? DEMO_EMAIL : `${person.key}@nexus.example`,
          imageUrl: `/demo/${person.key}.svg`,
        },
      });
    }

    await tx.server.upsert({
      where: { id: DEMO_SERVER_ID },
      update: { profileId: profileId("guest") },
      create: {
        id: DEMO_SERVER_ID, name: "Studio North", imageUrl: "/demo/studio.svg",
        inviteCode: "nexus-demo-preview", profileId: profileId("guest"),
      },
    });
    for (const person of demoPeople) {
      await tx.member.upsert({
        where: { id: memberId(person.key) }, update: person.key === "guest" ? { role: "ADMIN" } : {},
        create: {
          id: memberId(person.key), profileId: profileId(person.key),
          serverId: DEMO_SERVER_ID, role: person.key === "guest" ? "ADMIN" : "GUEST",
        },
      });
    }
    for (const channel of demoChannels) {
      await tx.channel.upsert({
        where: { id: `nexus-demo-${channel.key}` }, update: {},
        create: {
          id: `nexus-demo-${channel.key}`, name: channel.name, type: channel.type,
          profileId: profileId("guest"), serverId: DEMO_SERVER_ID,
        },
      });
    }

    const startedAt = Date.now() - 90 * 60_000;
    const timestamp = (index: number) => new Date(startedAt + index * 3 * 60_000);
    const receipts = (item: { content: string; state?: string }, date: Date) => ({
      deliveredAt: new Date(date.getTime() + 1_000),
      readAt: item.state === "delivered" ? null : new Date(date.getTime() + 3_000),
    });
    await tx.message.createMany({
      skipDuplicates: true,
      data: demoMessages.map((item, index) => ({
        id: `nexus-demo-message-${index}`, content: item.content,
        memberId: memberId(item.person), channelId: `nexus-demo-${item.room}`,
        createdAt: timestamp(index), ...receipts(item, timestamp(index)),
      })),
    });

    for (const person of demoPeople.filter((person) => person.key !== "guest")) {
      await tx.conversation.upsert({
        where: { id: `nexus-demo-dm-${person.key}` }, update: {},
        create: {
          id: `nexus-demo-dm-${person.key}`,
          memberOneId: memberId("guest"), memberTwoId: memberId(person.key),
        },
      });
    }
    await tx.directMessage.createMany({
      skipDuplicates: true,
      data: demoDirectMessages.map((item, index) => ({
        id: `nexus-demo-dm-message-${index}`, content: item.content,
        memberId: memberId(item.person), conversationId: `nexus-demo-dm-${item.other}`,
        createdAt: timestamp(index + demoMessages.length),
        ...receipts(item, timestamp(index + demoMessages.length)),
      })),
    });
    // Update only the original seed notice from the early read-only version;
    // never replace messages that a visitor has edited.
    await tx.directMessage.updateMany({
      where: {
        id: "nexus-demo-dm-message-3",
        content: "This is a shared, read-only preview. To send your own messages or create a space, sign out and create an account.",
      },
      data: { content: demoDirectMessages[3].content },
    });
    return { id: guest.id, name: guest.name, email: guest.email, image: "/demo/guest.svg" };
  }, { timeout: 20_000 });
}
