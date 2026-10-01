export const ICE_BATCH_SIZE = 16;
export function validIceBatch(data: unknown): data is RTCIceCandidateInit[] {
  return Array.isArray(data) && data.length > 0 && data.length <= ICE_BATCH_SIZE && data.every(item =>
    item && typeof item === "object" && typeof item.candidate === "string" && item.candidate.length <= 4096);
}
export function callVideoConstraints(mobile: boolean): MediaTrackConstraints {
  return mobile
    ? { width: { ideal: 640, max: 960 }, height: { ideal: 360, max: 540 }, frameRate: { ideal: 20, max: 24 }, facingMode: "user" }
    : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
}
export type PeerStatus = { connection: RTCPeerConnectionState; ice: RTCIceConnectionState; detail: string };
export async function playCallMedia(element: Pick<HTMLMediaElement, "play">): Promise<boolean> {
  try { await element.play(); return true; } catch { return false; }
}
type Options = {
  localId: string; remoteId: string;
  send(event: string, data: unknown): Promise<void>;
  refreshIce(): Promise<RTCIceServer[]>;
  status(status: PeerStatus): void;
  stream(stream: MediaStream): void;
};

/** Serializes SDP/ICE work and owns bounded recovery for one remote peer. */
export class CallPeer {
  private queue = Promise.resolve();
  private closed = false;
  private ignoredOffer = false;
  private candidates: RTCIceCandidateInit[] = [];
  private outgoing: RTCIceCandidateInit[] = [];
  private batchTimer?: ReturnType<typeof setTimeout>;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private recovering = false;
  private attempts = 0;
  private lastRestart = 0;
  private remoteStream?: MediaStream;
  constructor(readonly peer: RTCPeerConnection, private options: Options) {
    peer.onicecandidate = ({ candidate }) => {
      if (this.closed) return;
      if (candidate) this.outgoing.push(candidate.toJSON());
      if (!candidate || this.outgoing.length >= ICE_BATCH_SIZE) this.flushOutgoing();
      else this.batchTimer ??= setTimeout(() => this.flushOutgoing(), 100);
    };
    peer.ontrack = ({ streams, track }) => {
      if (this.closed) return;
      this.remoteStream = streams[0] ?? this.remoteStream ?? new MediaStream();
      if (!this.remoteStream.getTracks().some(t => t.id === track.id)) this.remoteStream.addTrack(track);
      options.stream(this.remoteStream);
    };
    peer.onconnectionstatechange = peer.oniceconnectionstatechange = () => {
      if (this.closed) return;
      if (peer.connectionState === "connected") {
        clearTimeout(this.recoveryTimer); this.recoveryTimer = undefined; this.attempts = 0;
        this.report("Media connected");
        void peer.getStats().then(stats => {
          if (this.closed || peer.connectionState !== "connected") return;
          stats.forEach(stat => {
            if (stat.type !== "transport" || !stat.selectedCandidatePairId) return;
            const pair = stats.get(stat.selectedCandidatePairId);
            const local = pair && stats.get(pair.localCandidateId);
            const remote = pair && stats.get(pair.remoteCandidateId);
            if (local && remote) this.report(local.candidateType === "relay" || remote.candidateType === "relay"
              ? "Media connected via relay" : "Media connected directly");
          });
        }).catch(() => {});
      } else if (peer.connectionState === "failed" || peer.iceConnectionState === "failed") {
        clearTimeout(this.recoveryTimer); this.recoveryTimer = undefined;
        this.report("Connection failed. Retrying…"); this.schedule(1000);
      } else if (peer.connectionState === "disconnected") {
        clearTimeout(this.recoveryTimer); this.recoveryTimer = undefined;
        this.report("Network interrupted. Reconnecting…"); this.schedule(3000);
      } else {
        this.report("Establishing media connection…"); this.schedule(20_000);
      }
    };
    this.report("Waiting for connection negotiation…");
    this.schedule(20_000);
  }
  private report(detail: string) {
    if (!this.closed) this.options.status({ connection: this.peer.connectionState, ice: this.peer.iceConnectionState, detail });
  }
  private run(operation: () => Promise<void>) {
    this.queue = this.queue.then(async () => { if (!this.closed) await operation(); }).catch(() => {
      this.report("Connection setup interrupted. Retrying…"); this.schedule(3000);
    });
    return this.queue;
  }
  private flushOutgoing() {
    clearTimeout(this.batchTimer); this.batchTimer = undefined;
    if (this.closed || !this.outgoing.length) return;
    const batch = this.outgoing.splice(0, ICE_BATCH_SIZE);
    void this.options.send("call:ice-batch", batch).catch(() => {
      this.report("Signaling interrupted. Retrying…"); this.schedule(3000);
    });
    if (this.outgoing.length) this.batchTimer = setTimeout(() => this.flushOutgoing(), 100);
  }
  offer(restart = false) {
    return this.run(async () => {
      if (this.peer.signalingState !== "stable") {
        if (!restart || this.peer.signalingState !== "have-local-offer") return;
        await this.peer.setLocalDescription({ type: "rollback" });
      }
      const offer = await this.peer.createOffer({ iceRestart: restart });
      if (this.closed) return;
      await this.peer.setLocalDescription(offer);
      if (!this.closed) await this.options.send("call:offer", this.peer.localDescription?.toJSON() ?? offer);
    });
  }
  description(data: RTCSessionDescriptionInit) {
    return this.run(async () => {
      const collision = data.type === "offer" && this.peer.signalingState !== "stable";
      // A deterministic polite peer rolls back on simultaneous initial/restart offers.
      this.ignoredOffer = collision && this.options.localId < this.options.remoteId;
      if (this.ignoredOffer) return;
      if (collision) await this.peer.setLocalDescription({ type: "rollback" });
      if (data.type === "answer" && this.peer.signalingState !== "have-local-offer") return;
      await this.peer.setRemoteDescription(data);
      for (const candidate of this.candidates.splice(0)) await this.addCandidate(candidate);
      if (data.type === "offer" && !this.closed) {
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        if (!this.closed) await this.options.send("call:answer", this.peer.localDescription?.toJSON() ?? answer);
      }
    });
  }
  ice(candidates: RTCIceCandidateInit[]) {
    return this.run(async () => {
      if (this.ignoredOffer) return;
      for (const candidate of candidates) {
        if (!this.peer.remoteDescription) this.candidates = [...this.candidates, candidate].slice(-128);
        else await this.addCandidate(candidate);
      }
    });
  }
  private async addCandidate(candidate: RTCIceCandidateInit) {
    // Late candidates from the previous ICE generation are expected on restart.
    if (candidate.usernameFragment && !this.peer.remoteDescription?.sdp?.includes(`a=ice-ufrag:${candidate.usernameFragment}`)) return;
    if (!this.closed) await this.peer.addIceCandidate(candidate);
  }
  private schedule(delay: number) {
    if (this.closed || this.recoveryTimer) return;
    this.recoveryTimer = setTimeout(() => { this.recoveryTimer = undefined; void this.recover(); }, delay);
  }
  requestRestart() {
    if (this.options.localId < this.options.remoteId) void this.recover(true);
  }
  private async recover(requested = false) {
    if (this.closed || this.recovering || (!requested && this.peer.connectionState === "connected")) return;
    if (requested && Date.now() - this.lastRestart < 5000) return;
    if (this.attempts >= 2) { this.report("Unable to connect media. Retry the call or try another network."); return; }
    this.recovering = true; this.attempts++; this.lastRestart = Date.now();
    this.report(`Reconnecting media (${this.attempts}/2)…`);
    try {
      // Only one side originates restart offers; the other asks it to do so.
      if (this.options.localId < this.options.remoteId) {
        const iceServers = await this.options.refreshIce();
        if (this.closed) return;
        const relay = this.attempts === 2 && iceServers.some(server =>
          [server.urls].flat().some(url => /^turns?:/.test(url)));
        this.peer.setConfiguration({ ...this.peer.getConfiguration(), iceServers, iceTransportPolicy: relay ? "relay" : "all" });
        await this.offer(true);
      } else await this.options.send("call:restart", {});
    } catch { this.report("Relay or signaling unavailable. Retrying…"); }
    finally { this.recovering = false; this.schedule(15_000); }
  }
  close() {
    this.closed = true;
    clearTimeout(this.batchTimer); clearTimeout(this.recoveryTimer);
    this.outgoing = []; this.candidates = [];
    this.peer.onicecandidate = null; this.peer.ontrack = null;
    this.peer.onconnectionstatechange = null; this.peer.oniceconnectionstatechange = null;
    this.peer.close();
  }
}
