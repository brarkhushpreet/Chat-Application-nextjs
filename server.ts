import { createServer as createHttpServer } from "node:http";
import { networkInterfaces } from "node:os";
import nextEnv from "@next/env";
import next from "next";
import { getToken } from "next-auth/jwt";
import { Server as SocketIOServer, type Socket } from "socket.io";

import { callRoom, chatRoom, registerRealtimeServer, userRoom } from "./lib/realtime";

type RoomKind = "channel" | "conversation";

type Participant = {
  socketId: string;
  userId: string;
  name: string;
  imageUrl: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
};

type SocketData = {
  userId: string;
  participant?: Participant;
};

const projectDir = process.cwd();
const dev =
  process.env.NODE_ENV !== "production" &&
  process.env.npm_lifecycle_event !== "start";
nextEnv.loadEnvConfig(projectDir, dev);

const hostname = dev ? "0.0.0.0" : (process.env.APP_HOSTNAME ?? "0.0.0.0");
const port = Number(process.env.PORT ?? 3000);

function getLanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address?.address)
    .filter((address): address is string => Boolean(address));
}

async function start() {
  const [{ db }] = await Promise.all([import("./lib/db")]);
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const lanAddresses = [...new Set(getLanAddresses())];
  const requestHandler = (
    request: Parameters<typeof handle>[0],
    response: Parameters<typeof handle>[1],
  ) => {
    void handle(request, response);
  };
  const httpServer = createHttpServer(requestHandler);

  const io = new SocketIOServer<
    Record<string, never>,
    Record<string, never>,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1_000,
      skipMiddlewares: false,
    },
    cors: {
      origin: dev
        ? true
        : (process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`),
      credentials: true,
    },
  });

  registerRealtimeServer(io);

  io.use(async (socket, nextSocket) => {
    const secret = process.env.AUTH_SECRET;

    if (!secret) {
      return nextSocket(new Error("Authentication is not configured"));
    }

    try {
      const headers = new Headers();
      for (let index = 0; index < socket.request.rawHeaders.length; index += 2) {
        headers.append(
          socket.request.rawHeaders[index],
          socket.request.rawHeaders[index + 1],
        );
      }
      const forwardedProtocol = socket.request.headers["x-forwarded-proto"];
      const secureCookie =
        (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol)
          ?.split(",")[0]
          .trim() === "https";
      const request = new Request("http://nexus.local/socket.io", { headers });
      const token =
        (await getToken({ req: request, secret, secureCookie })) ??
        (await getToken({ req: request, secret, secureCookie: !secureCookie }));

      if (!token?.sub) {
        return nextSocket(new Error("Authentication required"));
      }

      socket.data.userId = token.sub;
      nextSocket();
    } catch {
      nextSocket(new Error("Invalid or expired session"));
    }
  });

  async function canAccessRoom(userId: string, roomId: string, kind: RoomKind) {
    if (kind === "channel") {
      return Boolean(
        await db.channel.findFirst({
          where: {
            id: roomId,
            server: {
              members: {
                some: { profile: { userId } },
              },
            },
          },
          select: { id: true },
        }),
      );
    }

    return Boolean(
      await db.conversation.findFirst({
        where: {
          id: roomId,
          OR: [
            { memberOne: { profile: { userId } } },
            { memberTwo: { profile: { userId } } },
          ],
        },
        select: { id: true },
      }),
    );
  }

  function isSocketInCall(targetId: string, roomId: string) {
    return io.sockets.adapter.rooms.get(callRoom(roomId))?.has(targetId) ?? false;
  }

  io.on("connection", async (socket: Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>) => {
    await socket.join(userRoom(socket.data.userId));

    const profile = await db.profile.findUnique({
      where: { userId: socket.data.userId },
      select: { name: true, imageUrl: true },
    });

    if (profile) {
      socket.data.participant = {
        socketId: socket.id,
        userId: socket.data.userId,
        name: profile.name,
        imageUrl: profile.imageUrl,
        audioEnabled: true,
        videoEnabled: true,
        screenSharing: false,
      };
    }

    socket.on(
      "room:join",
      async (
        payload: { roomId?: string; kind?: RoomKind },
        acknowledge?: (result: { ok: boolean; error?: string }) => void,
      ) => {
        const { roomId, kind } = payload ?? {};
        if (!roomId || (kind !== "channel" && kind !== "conversation")) {
          return acknowledge?.({ ok: false, error: "Invalid room" });
        }

        if (!(await canAccessRoom(socket.data.userId, roomId, kind))) {
          return acknowledge?.({ ok: false, error: "Room access denied" });
        }

        await socket.join(chatRoom(roomId));
        acknowledge?.({ ok: true });
      },
    );

    socket.on("room:leave", (roomId: string) => {
      void socket.leave(chatRoom(roomId));
    });

    socket.on(
      "room:read",
      async (
        payload: { roomId?: string; kind?: RoomKind },
        acknowledge?: (result: { ok: boolean; readAt?: string; error?: string }) => void,
      ) => {
        const { roomId, kind } = payload ?? {};
        if (!roomId || (kind !== "channel" && kind !== "conversation")) {
          return acknowledge?.({ ok: false, error: "Invalid room" });
        }

        if (
          !socket.rooms.has(chatRoom(roomId)) ||
          !(await canAccessRoom(socket.data.userId, roomId, kind))
        ) {
          return acknowledge?.({ ok: false, error: "Room access denied" });
        }

        const readAt = new Date();
        const unreadByOtherMembers = {
          readAt: null,
          member: {
            profile: {
              userId: { not: socket.data.userId },
            },
          },
        };

        if (kind === "channel") {
          const channel = await db.channel.findUnique({
            where: { id: roomId },
            select: { serverId: true },
          });
          const reader = channel
            ? await db.member.findFirst({
                where: {
                  serverId: channel.serverId,
                  profile: { userId: socket.data.userId },
                },
                select: { id: true },
              })
            : null;

          if (!reader) {
            return acknowledge?.({ ok: false, error: "Member not found" });
          }

          await db.message.updateMany({
            where: {
              channelId: roomId,
              ...unreadByOtherMembers,
            },
            data: { readAt, deliveredAt: readAt },
          });

          await db.channelReadState.upsert({
            where: {
              memberId_channelId: { memberId: reader.id, channelId: roomId },
            },
            create: { memberId: reader.id, channelId: roomId, lastReadAt: readAt },
            update: { lastReadAt: readAt },
          });
        } else {
          const conversation = await db.conversation.findUnique({
            where: { id: roomId },
            include: {
              memberOne: { include: { profile: true } },
              memberTwo: { include: { profile: true } },
            },
          });
          const reader =
            conversation?.memberOne.profile.userId === socket.data.userId
              ? conversation.memberOne
              : conversation?.memberTwo.profile.userId === socket.data.userId
                ? conversation.memberTwo
                : null;

          if (!reader) {
            return acknowledge?.({ ok: false, error: "Member not found" });
          }

          await db.directMessage.updateMany({
            where: {
              conversationId: roomId,
              ...unreadByOtherMembers,
            },
            data: { readAt, deliveredAt: readAt },
          });

          await db.conversationReadState.upsert({
            where: {
              memberId_conversationId: {
                memberId: reader.id,
                conversationId: roomId,
              },
            },
            create: {
              memberId: reader.id,
              conversationId: roomId,
              lastReadAt: readAt,
            },
            update: { lastReadAt: readAt },
          });
        }

        const serializedReadAt = readAt.toISOString();
        io.to(chatRoom(roomId)).emit("chat:read", {
          roomId,
          readerUserId: socket.data.userId,
          readAt: serializedReadAt,
        });
        io.to(userRoom(socket.data.userId)).emit("sidebar:read", {
          roomId,
          kind,
          readAt: serializedReadAt,
        });
        acknowledge?.({ ok: true, readAt: serializedReadAt });
      },
    );

    socket.on(
      "call:join",
      async (
        payload: { roomId?: string; kind?: RoomKind },
        acknowledge?: (result: {
          ok: boolean;
          peers?: Participant[];
          error?: string;
        }) => void,
      ) => {
        const { roomId, kind } = payload ?? {};
        let participant = socket.data.participant;

        if (!participant) {
          const latestProfile = await db.profile.findUnique({
            where: { userId: socket.data.userId },
            select: { name: true, imageUrl: true },
          });
          if (latestProfile) {
            participant = {
              socketId: socket.id,
              userId: socket.data.userId,
              name: latestProfile.name,
              imageUrl: latestProfile.imageUrl,
              audioEnabled: true,
              videoEnabled: true,
              screenSharing: false,
            };
            socket.data.participant = participant;
          }
        }

        if (!roomId || !participant || (kind !== "channel" && kind !== "conversation")) {
          return acknowledge?.({ ok: false, error: "Invalid call room" });
        }

        if (!(await canAccessRoom(socket.data.userId, roomId, kind))) {
          return acknowledge?.({ ok: false, error: "Call access denied" });
        }

        const existingIds = io.sockets.adapter.rooms.get(callRoom(roomId)) ?? new Set<string>();
        const peers = Array.from(existingIds)
          .filter((socketId) => socketId !== socket.id)
          .map((socketId) => io.sockets.sockets.get(socketId)?.data.participant)
          .filter((peer): peer is Participant => Boolean(peer));

        await socket.join(callRoom(roomId));
        socket.to(callRoom(roomId)).emit("call:peer-joined", participant);
        acknowledge?.({ ok: true, peers });
      },
    );

    socket.on("call:leave", (roomId: string) => {
      void socket.leave(callRoom(roomId));
      socket.to(callRoom(roomId)).emit("call:peer-left", socket.id);
    });

    for (const event of ["call:offer", "call:answer", "call:ice"] as const) {
      socket.on(
        event,
        (payload: { roomId?: string; target?: string; data?: unknown }) => {
          const { roomId, target, data } = payload ?? {};
          if (!roomId || !target || !isSocketInCall(socket.id, roomId) || !isSocketInCall(target, roomId)) {
            return;
          }
          io.to(target).emit(event, { from: socket.id, data });
        },
      );
    }

    socket.on(
      "call:media-state",
      (payload: {
        roomId?: string;
        audioEnabled?: boolean;
        videoEnabled?: boolean;
        screenSharing?: boolean;
      }) => {
        const { roomId } = payload ?? {};
        if (!roomId || !isSocketInCall(socket.id, roomId) || !socket.data.participant) {
          return;
        }

        socket.data.participant = {
          ...socket.data.participant,
          audioEnabled: Boolean(payload.audioEnabled),
          videoEnabled: Boolean(payload.videoEnabled),
          screenSharing: Boolean(payload.screenSharing),
        };
        socket.to(callRoom(roomId)).emit("call:media-state", socket.data.participant);
      },
    );

    socket.on("disconnecting", () => {
      for (const joinedRoom of Array.from(socket.rooms)) {
        if (joinedRoom.startsWith("call:")) {
          socket.to(joinedRoom).emit("call:peer-left", socket.id);
        }
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    const localUrl = `http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`;
    console.log(`Nexus ready\n  Local:   ${localUrl}`);

    if (hostname === "0.0.0.0") {
      for (const address of lanAddresses) {
        console.log(`  Network: http://${address}:${port}`);
      }
    }

  });
}

start().catch((error) => {
  console.error("Unable to start Nexus", error);
  process.exit(1);
});
