"use client";

import { useRouter } from "next/navigation";
import {
  Camera,
  CameraOff,
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSocket } from "@/components/provider/socket-provider";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

type RoomKind = "channel" | "conversation";

type CallParticipant = {
  socketId: string;
  userId: string;
  name: string;
  imageUrl: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  stream?: MediaStream;
};

type CallError = {
  title: string;
  message: string;
  retryable: boolean;
};

interface MediaRoomProps {
  chatId: string;
  video: boolean;
  audio: boolean;
  roomKind: RoomKind;
}

async function getIceServers(roomId: string, kind: RoomKind): Promise<RTCIceServer[]> {
  const response = await fetch(`/api/calls/ice?roomId=${encodeURIComponent(roomId)}&kind=${kind}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Call configuration unavailable");
  return result.iceServers;
}

function getVideoSender(peer: RTCPeerConnection) {
  return (
    peer.getSenders().find(({ track }) => track?.kind === "video") ??
    peer.getTransceivers().find(({ receiver }) => receiver.track.kind === "video")?.sender
  );
}

export const MediaRoom = ({ chatId, video, audio, roomKind }: MediaRoomProps) => {
  const { socket, isConnected } = useSocket();
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const candidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const participantDetailsRef = useRef(new Map<string, CallParticipant>());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(audio);
  const [videoEnabled, setVideoEnabled] = useState(video);
  const [screenSharing, setScreenSharing] = useState(false);
  const [status, setStatus] = useState<"joining" | "joined" | "error">("joining");
  const [error, setError] = useState<CallError | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);

  const updateParticipant = useCallback((participant: CallParticipant) => {
    const previous = participantDetailsRef.current.get(participant.socketId);
    const merged = {
      ...previous,
      ...participant,
      stream: participant.stream ?? previous?.stream,
    };
    participantDetailsRef.current.set(participant.socketId, merged);
    setParticipants((current) => {
      const found = current.some((item) => item.socketId === participant.socketId);
      return found
        ? current.map((item) =>
            item.socketId === participant.socketId
              ? { ...item, ...merged }
              : item,
          )
        : [...current, merged];
    });
  }, []);

  const removeParticipant = useCallback((socketId: string) => {
    peersRef.current.get(socketId)?.close();
    peersRef.current.delete(socketId);
    candidatesRef.current.delete(socketId);
    participantDetailsRef.current.delete(socketId);
    setParticipants((current) => current.filter((item) => item.socketId !== socketId));
  }, []);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!socket) return;

    let disposed = false;
    let mediaStarting = false;
    let mediaReady = false;
    let joinInFlight = false;
    let socketEventsBound = false;
    const peers = peersRef.current;
    const participantDetails = participantDetailsRef.current;

    const flushCandidates = async (peerId: string, peer: RTCPeerConnection) => {
      const queued = candidatesRef.current.get(peerId) ?? [];
      candidatesRef.current.delete(peerId);
      await Promise.all(queued.map((candidate) => peer.addIceCandidate(candidate)));
    };

    const createPeer = (participant: CallParticipant) => {
      const existing = peersRef.current.get(participant.socketId);
      if (existing) return existing;

      updateParticipant(participant);
      const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
      peersRef.current.set(participant.socketId, peer);

      for (const track of localStreamRef.current?.getTracks() ?? []) {
        peer.addTrack(track, localStreamRef.current!);
      }
      if (!localStreamRef.current?.getVideoTracks().length) {
        peer.addTransceiver("video", { direction: "sendrecv" });
      }

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit("call:ice", {
            roomId: chatId,
            target: participant.socketId,
            data: candidate.toJSON(),
          });
        }
      };

      peer.ontrack = ({ streams }) => {
        const details = participantDetailsRef.current.get(participant.socketId) ?? participant;
        updateParticipant({ ...details, stream: streams[0] });
      };

      peer.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(peer.connectionState)) {
          removeParticipant(participant.socketId);
        }
      };

      return peer;
    };

    const makeOffer = async (participant: CallParticipant) => {
      const peer = createPeer(participant);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("call:offer", {
        roomId: chatId,
        target: participant.socketId,
        data: offer,
      });
    };

    const onPeerJoined = (participant: CallParticipant) => updateParticipant(participant);
    const onPeerLeft = (socketId: string) => removeParticipant(socketId);
    const onMediaState = (participant: CallParticipant) => updateParticipant(participant);

    const onOffer = async ({ from, data }: { from: string; data: RTCSessionDescriptionInit }) => {
      const participant = participantDetailsRef.current.get(from) ?? {
        socketId: from,
        userId: from,
        name: "Guest",
        imageUrl: "",
        audioEnabled: true,
        videoEnabled: true,
        screenSharing: false,
      };
      const peer = createPeer(participant);
      await peer.setRemoteDescription(data);
      await flushCandidates(from, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("call:answer", { roomId: chatId, target: from, data: answer });
    };

    const onAnswer = async ({ from, data }: { from: string; data: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current.get(from);
      if (!peer) return;
      await peer.setRemoteDescription(data);
      await flushCandidates(from, peer);
    };

    const onIce = async ({ from, data }: { from: string; data: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(from);
      if (!peer?.remoteDescription) {
        candidatesRef.current.set(from, [...(candidatesRef.current.get(from) ?? []), data]);
        return;
      }
      await peer.addIceCandidate(data);
    };

    const bindSocketEvents = () => {
      if (socketEventsBound) return;
      socketEventsBound = true;
      socket.on("call:peer-joined", onPeerJoined);
      socket.on("call:peer-left", onPeerLeft);
      socket.on("call:media-state", onMediaState);
      socket.on("call:offer", onOffer);
      socket.on("call:answer", onAnswer);
      socket.on("call:ice", onIce);
    };

    const joinCall = () => {
      if (!socket.connected || !mediaReady || joinInFlight || disposed) return;

      joinInFlight = true;
      setStatus("joining");
      socket.timeout(10_000).emit(
        "call:join",
        { roomId: chatId, kind: roomKind },
        (
          timeoutError: Error | null,
          result?: { ok: boolean; peers?: CallParticipant[]; error?: string },
        ) => {
          joinInFlight = false;
          if (disposed) return;

          if (timeoutError) {
            setStatus("error");
            setError({
              title: "Call server did not respond",
              message:
                "The realtime connection was interrupted while joining. Nexus will keep reconnecting; you can retry the call now.",
              retryable: true,
            });
            return;
          }
          if (!result?.ok) {
            setStatus("error");
            setError({
              title: "Couldn’t enter the room",
              message: result?.error ?? "Unable to join this call.",
              retryable: true,
            });
            return;
          }
          setStatus("joined");
          socket.emit("call:media-state", {
            roomId: chatId,
            audioEnabled: audio,
            videoEnabled: video,
            screenSharing: false,
          });
          for (const participant of result.peers ?? []) void makeOffer(participant);
        },
      );
    };

    const startCall = async () => {
      if (mediaStarting || mediaReady || disposed) return;
      mediaStarting = true;
      setStatus("joining");
      setError(null);

      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setStatus("error");
          setError({
            title: "Secure connection required",
            message:
              "Your browser requires a secure connection for camera and microphone access. Use http://localhost:3000 on the computer running Nexus, or an HTTPS deployment for calls from another device. Chat is available over the HTTP network address.",
            retryable: false,
          });
          return;
        }

        iceServersRef.current = await getIceServers(chatId, roomKind);
        if (disposed) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio,
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        mediaReady = true;
        setLocalStream(stream);
        bindSocketEvents();
        joinCall();
      } catch (mediaError) {
        setStatus("error");
        if (mediaError instanceof DOMException && mediaError.name === "NotAllowedError") {
          setError({
            title: "Permission needed",
            message:
              "Camera or microphone access was denied. Allow both permissions in the browser’s site settings, then try again.",
            retryable: true,
          });
        } else if (
          mediaError instanceof DOMException &&
          mediaError.name === "NotFoundError"
        ) {
          setError({
            title: "No media device found",
            message: "Connect a camera or microphone, then try joining again.",
            retryable: true,
          });
        } else if (
          mediaError instanceof DOMException &&
          ["NotReadableError", "AbortError"].includes(mediaError.name)
        ) {
          setError({
            title: "Camera or microphone is busy",
            message:
              "Another application may be using the device. Close it, check the browser’s selected devices, and try again.",
            retryable: true,
          });
        } else if (mediaError instanceof Error && !(mediaError instanceof DOMException)) {
          setError({ title: "Call setup unavailable", message: mediaError.message, retryable: true });
        } else {
          setError({
            title: "Couldn’t start your devices",
            message:
              "The camera or microphone could not be started. Check the browser permissions and selected devices, then try again.",
            retryable: true,
          });
        }
      } finally {
        mediaStarting = false;
      }
    };

    const onConnect = () => {
      if (!mediaReady) {
        void startCall();
        return;
      }
      peers.forEach((peer) => peer.close());
      peers.clear();
      participantDetails.clear();
      setParticipants([]);
      joinCall();
    };

    const onDisconnect = () => {
      joinInFlight = false;
      if (mediaReady && !disposed) setStatus("joining");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    void startCall();

    // Rotate short-lived relay credentials during long calls. Never put a
    // permanent TURN key in NEXT_PUBLIC_* variables or the browser bundle.
    const refreshRelay = window.setInterval(() => {
      if (!mediaReady || disposed) return;
      void getIceServers(chatId, roomKind).then(iceServers => {
        if (disposed) return;
        iceServersRef.current = iceServers;
        peers.forEach(peer => peer.setConfiguration({ ...peer.getConfiguration(), iceServers }));
      }).catch(() => { /* Existing credentials remain valid; retry on the next refresh. */ });
    }, 15 * 60_000);

    return () => {
      disposed = true;
      window.clearInterval(refreshRelay);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("call:peer-joined", onPeerJoined);
      socket.off("call:peer-left", onPeerLeft);
      socket.off("call:media-state", onMediaState);
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice", onIce);
      socket.emit("call:leave", chatId);
      peers.forEach((peer) => peer.close());
      peers.clear();
      participantDetails.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraTrackRef.current?.stop();
      screenTrackRef.current?.stop();
      localStreamRef.current = null;
    };
  }, [
    audio,
    chatId,
    removeParticipant,
    retrySequence,
    roomKind,
    socket,
    updateParticipant,
    video,
  ]);

  const publishMediaState = useCallback(
    (next: { audioEnabled?: boolean; videoEnabled?: boolean; screenSharing?: boolean }) => {
      socket?.emit("call:media-state", {
        roomId: chatId,
        audioEnabled,
        videoEnabled,
        screenSharing,
        ...next,
      });
    },
    [audioEnabled, chatId, screenSharing, socket, videoEnabled],
  );

  const toggleAudio = () => {
    const next = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = next));
    setAudioEnabled(next);
    publishMediaState({ audioEnabled: next });
  };

  const toggleVideo = () => {
    const next = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => (track.enabled = next));
    if (cameraTrackRef.current) cameraTrackRef.current.enabled = next;
    setVideoEnabled(next);
    publishMediaState({ videoEnabled: next });
  };

  const stopScreenShare = useCallback(() => {
    const cameraTrack = cameraTrackRef.current;
    const currentStream = localStreamRef.current;
    if (!currentStream) return;
    peersRef.current.forEach((peer) => {
      const sender = getVideoSender(peer);
      void sender?.replaceTrack(cameraTrack);
    });
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    const nextStream = new MediaStream([
      ...currentStream.getAudioTracks(),
      ...(cameraTrack ? [cameraTrack] : []),
    ]);
    localStreamRef.current = nextStream;
    setLocalStream(nextStream);
    setScreenSharing(false);
    setVideoEnabled(Boolean(cameraTrack));
    publishMediaState({ screenSharing: false, videoEnabled: Boolean(cameraTrack) });
  }, [publishMediaState]);

  const toggleScreenShare = async () => {
    if (screenSharing) return stopScreenShare();
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = display.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;
      peersRef.current.forEach((peer) => {
        const sender = getVideoSender(peer);
        void sender?.replaceTrack(screenTrack);
      });
      screenTrack.onended = stopScreenShare;
      const nextStream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        screenTrack,
      ]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setScreenSharing(true);
      setVideoEnabled(true);
      publishMediaState({ screenSharing: true, videoEnabled: true });
    } catch {
      // Closing the browser picker is expected and needs no error state.
    }
  };

  const leaveCall = () => {
    socket?.emit("call:leave", chatId);
    router.back();
  };

  const retryCall = () => {
    setLocalStream(null);
    setParticipants([]);
    setError(null);
    setStatus("joining");
    setRetrySequence((sequence) => sequence + 1);
  };

  if (status === "error") {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#eef1f6] p-6 dark:bg-[#0b0e14]">
        <div className="absolute inset-0 call-glow opacity-70" />
        <div className="relative max-w-md rounded-[1.5rem] border border-[#dfe3eb] bg-white p-8 text-center shadow-xl shadow-black/[0.06] dark:border-white/[0.08] dark:bg-[#151a23] dark:shadow-none">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <CameraOff className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            {error?.title ?? "Couldn’t enter the room"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">
            {error?.message}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {error?.retryable && (
              <button
                type="button"
                onClick={retryCall}
                className="inline-flex items-center gap-2 rounded-xl bg-[#7567ff] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6959f6]"
              >
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            )}
            <button
              type="button"
              onClick={leaveCall}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.04] px-5 py-2.5 text-sm font-semibold text-black/70 transition hover:bg-black/[0.07] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/10"
            >
              <PhoneOff className="h-4 w-4" /> Leave call
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#eef1f6] text-[#14171f] dark:bg-[#0b0e14] dark:text-white">
      <div className="pointer-events-none absolute inset-0 call-glow opacity-70" />
      <div className="relative flex items-center justify-between px-5 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6d5dfc] text-white shadow-lg shadow-[#6d5dfc]/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold tracking-tight">Huddle room</h2>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-xs text-black/45 dark:text-white/45">Peer-to-peer · encrypted in transit</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/55 px-3 py-2 text-xs font-medium backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
          {status === "joining" || !isConnected ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#6d5dfc]" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" />
          )}
          {status === "joining" ? "Joining" : `${participants.length + 1} here`}
        </div>
      </div>

      <div className="relative grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-3 overflow-y-auto px-4 pb-28 md:grid-cols-2 md:gap-4 md:px-8 lg:grid-cols-3">
        <ParticipantTile
          name="You"
          stream={localStream ?? undefined}
          videoEnabled={videoEnabled}
          audioEnabled={audioEnabled}
          screenSharing={screenSharing}
          muted
          videoRef={localVideoRef}
        />
        {participants.map((participant) => (
          <ParticipantTile key={participant.socketId} {...participant} />
        ))}
        {participants.length === 0 && status === "joined" && (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-[2rem] border border-dashed border-black/10 bg-white/25 p-8 text-center dark:border-white/10 dark:bg-white/[0.025]">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <Users className="h-5 w-5 text-black/45 dark:text-white/45" />
            </span>
            <p className="text-sm font-semibold">The room is yours</p>
            <p className="mt-1 max-w-[240px] text-xs leading-5 text-black/45 dark:text-white/45">
              Other members will appear here the moment they join this huddle.
            </p>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-[#d9deea] bg-white p-2 shadow-lg shadow-slate-900/10 dark:border-white/10 dark:bg-[#151820] dark:shadow-black/30">
          <CallControl active={audioEnabled} label={audioEnabled ? "Mute" : "Unmute"} onClick={toggleAudio}>
            {audioEnabled ? <Mic /> : <MicOff />}
          </CallControl>
          <CallControl active={videoEnabled} label={videoEnabled ? "Camera off" : "Camera on"} onClick={toggleVideo} disabled={!video}>
            {videoEnabled ? <Camera /> : <CameraOff />}
          </CallControl>
          <CallControl active={screenSharing} label={screenSharing ? "Stop sharing" : "Share screen"} onClick={toggleScreenShare}>
            <MonitorUp />
          </CallControl>
          <div className="mx-1 h-8 w-px bg-border" />
          <button
            onClick={leaveCall}
            aria-label="Leave call"
            className="flex h-11 items-center gap-2 rounded-2xl bg-rose-500 px-4 text-sm font-semibold text-white transition hover:bg-rose-400"
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
};

function ParticipantTile({
  name,
  imageUrl,
  stream,
  videoEnabled,
  audioEnabled,
  screenSharing,
  muted = false,
  videoRef,
}: Partial<CallParticipant> & {
  name: string;
  muted?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const ownVideoRef = useRef<HTMLVideoElement>(null);
  const resolvedRef = videoRef ?? ownVideoRef;

  useEffect(() => {
    if (resolvedRef.current) resolvedRef.current.srcObject = stream ?? null;
  }, [resolvedRef, stream]);

  return (
    <div className="group relative min-h-56 overflow-hidden rounded-2xl border border-[#dce1eb] bg-[#e9edf5] shadow-sm dark:border-white/[0.08] dark:bg-[#12151c]">
      <video
        ref={resolvedRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition duration-500",
          screenSharing && "object-contain",
          (!videoEnabled || !stream) && "opacity-0",
        )}
      />
      {(!videoEnabled || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute h-40 w-40 rounded-full bg-[#6d5dfc]/15 blur-3xl" />
          <UserAvatar src={imageUrl} className="relative h-20 w-20 border-4 border-white/10 shadow-2xl" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/65 via-black/10 to-transparent p-4 pt-16 text-white">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{name}</p>
            {screenSharing && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Presenting</span>}
          </div>
          <p className="text-[10px] text-white/55">{stream ? "Connected" : "Linking media"}</p>
        </div>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-black/30", !audioEnabled && "bg-rose-500")}>
          {audioEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        </span>
      </div>
    </div>
  );
}

function CallControl({
  children,
  active,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4",
        active
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20 dark:hover:bg-rose-500/25",
      )}
    >
      {children}
    </button>
  );
}
