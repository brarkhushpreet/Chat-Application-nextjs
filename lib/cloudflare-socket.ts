/* Event adapter for the existing UI. This is native WebSocket/HTTP, not the
 * Socket.IO wire protocol. Reconnect always rejoins rooms and refetches history. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Listener = (...args: any[]) => void;
export interface RealtimeSocket {
  connected: boolean; active: boolean; recovered: boolean; id?: string;
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
  emit(event: string, payload?: unknown, ack?: Listener): unknown;
  timeout(ms: number): { emit(event: string, payload: unknown, ack: Listener): unknown };
  connect(): unknown; disconnect(): unknown;
}
type Packet = { event?: string; payload?: any; ack?: string; result?: unknown };

export class CloudflareSocket implements RealtimeSocket {
  connected = false;
  active = false;
  recovered = false;
  id?: string;
  transport: "websocket" | "polling" | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private pending = new Map<string, { callback: Listener; timer: ReturnType<typeof setTimeout> }>();
  private ws?: WebSocket;
  private pollId?: string;
  private cursor = 0;
  private generation = 0;
  private failures = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastPong = 0;
  private polling = false;
  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener); return this;
  }
  off(event: string, listener: Listener) { this.listeners.get(event)?.delete(listener); return this; }
  private dispatch(event: string, ...args: unknown[]) { this.listeners.get(event)?.forEach(listener => listener(...args)); }
  connect() {
    if (this.active) return this;
    this.active = true; this.failures = 0; this.openWebSocket(); return this;
  }
  private openWebSocket() {
    if (!this.active || this.ws) return;
    const generation = this.generation;
    const url = new URL("/api/realtime/socket", location.href); url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url); this.ws = ws;
    let welcomed = false;
    const timeout = setTimeout(() => ws.close(), 10_000);
    ws.onmessage = event => {
      if (generation !== this.generation) return;
      if (event.data === "pong") { this.lastPong = Date.now(); return; }
      try {
        const packet: Packet = JSON.parse(event.data);
        if (packet.event === "welcome") {
          welcomed = true; clearTimeout(timeout); this.failures = 0;
          if (this.connected) this.lost();
          const oldPoll = this.pollId; this.pollId = undefined;
          clearTimeout(this.pollTimer);
          if (oldPoll) void this.request(`disconnect?sid=${oldPoll}`, "POST").catch(() => {});
          this.id = packet.payload.id; this.transport = "websocket"; this.connected = true;
          this.lastPong = Date.now();
          clearInterval(this.heartbeat);
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastPong > 45_000) ws.close();
            else if (ws.readyState === WebSocket.OPEN) ws.send("ping");
          }, 15_000);
          this.dispatch("connect"); this.dispatch("transport", this.transport);
        } else this.receive(packet);
      } catch { ws.close(); }
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (generation !== this.generation) return;
      this.ws = undefined; clearInterval(this.heartbeat);
      if (welcomed) this.lost();
      this.failures++;
      if (!this.pollId && this.failures >= 2) void this.startPolling();
      if (!this.connected) this.dispatch("connect_error", new Error("Reconnecting to realtime service…"));
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }
  private scheduleRetry() {
    clearTimeout(this.retry);
    if (!this.active) return;
    const delay = this.pollId ? 20_000 : Math.min(500 * 2 ** Math.min(this.failures, 4), 5000);
    this.retry = setTimeout(() => this.openWebSocket(), delay + Math.random() * 500);
  }
  private async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`/api/realtime/${path}`, { method, credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Please sign in again." : "Realtime service unavailable");
    return response.json();
  }
  private async startPolling() {
    if (!this.active || this.pollId || this.polling || this.transport === "websocket") return;
    this.polling = true;
    const generation = this.generation;
    try {
      const { id } = await this.request("connect", "POST");
      if (generation !== this.generation || this.transport === ("websocket" as string)) {
        void this.request(`disconnect?sid=${id}`, "POST").catch(() => {}); return;
      }
      this.pollId = id; this.id = id; this.cursor = 0;
      this.transport = "polling"; this.connected = true;
      this.dispatch("connect"); this.dispatch("transport", this.transport);
      void this.poll(id, generation);
    } catch (error) {
      this.dispatch("connect_error", error);
    } finally { this.polling = false; }
  }
  private async poll(id: string, generation: number) {
    if (!this.active || this.pollId !== id || this.generation !== generation) return;
    try {
      const result = await this.request(`poll?sid=${id}&cursor=${this.cursor}`);
      if (this.pollId !== id || this.generation !== generation) return;
      if (result.gap) throw new Error("Event history changed; resynchronizing");
      for (const item of result.events) this.receive(item.message);
      this.cursor = result.cursor;
      this.pollTimer = setTimeout(() => void this.poll(id, generation), 1000);
    } catch (error) {
      if (this.pollId !== id || this.generation !== generation) return;
      this.pollId = undefined; this.lost(); this.dispatch("connect_error", error);
      this.pollTimer = setTimeout(() => void this.startPolling(), 2000);
    }
  }
  private receive(packet: Packet) {
    if (packet.event === "resync") {
      this.dispatch("connect");
    } else if (packet.ack) {
      const pending = this.pending.get(packet.ack);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(packet.ack); pending.callback(null, packet.result); }
    } else if (packet.event) this.dispatch(packet.event, packet.payload);
  }
  private lost() {
    const wasConnected = this.connected;
    this.connected = false; this.transport = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.callback(new Error("Connection interrupted")); }
    this.pending.clear();
    if (wasConnected) this.dispatch("disconnect", "transport close");
  }
  emit(event: string, payload?: unknown, ack?: Listener) { return this.send(event, payload, ack, 10_000); }
  timeout(ms: number) { return { emit: (event: string, payload: unknown, ack: Listener) => this.send(event, payload, ack, ms) }; }
  private send(event: string, payload: unknown, callback: Listener | undefined, timeout: number) {
    if (!this.connected) { callback?.(new Error("Not connected")); return this; }
    const ack = callback ? crypto.randomUUID() : undefined;
    if (ack && callback) {
      const timer = setTimeout(() => { this.pending.delete(ack); callback(new Error("Acknowledgement timed out")); }, timeout);
      this.pending.set(ack, { callback, timer });
    }
    const packet = { event, payload, ack };
    if (this.transport === "websocket" && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(packet));
    else if (this.pollId) {
      void this.request(`event?sid=${this.pollId}`, "POST", packet).then(result => { if (ack) this.receive({ ack, result }); }).catch(() => {
        if (ack) { const p = this.pending.get(ack); if (p) { clearTimeout(p.timer); this.pending.delete(ack); p.callback(new Error("Event failed")); } }
      });
    }
    return this;
  }
  disconnect() {
    this.active = false; this.generation++;
    clearTimeout(this.retry); clearTimeout(this.pollTimer); clearInterval(this.heartbeat);
    this.ws?.close(); this.ws = undefined;
    if (this.pollId) void this.request(`disconnect?sid=${this.pollId}`, "POST").catch(() => {});
    this.pollId = undefined; this.lost(); return this;
  }
}
