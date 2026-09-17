# Nexus

Nexus is a realtime workspace for conversations and lightweight team huddles. It began as a Discord-style learning project and now has its own visual system, a persistent authenticated realtime server, and a native WebRTC call stack with no LiveKit dependency.

## Cloudflare deployment

Deploy the application to **Cloudflare Workers + Durable Objects + R2**, with **Neon
PostgreSQL** and **Cloudflare TURN** for native WebRTC calls. No VPS or UploadThing
account is required. Chat, notifications, polling fallback, reconnects, and calls
remain available. See [the complete deployment guide](docs/CLOUDFLARE_DEPLOYMENT.md)
for resource setup, secrets, GitHub callbacks, data migration, cost caveats, and testing.

## What changed

- Replaced the 500 ms React Query polling loop with authenticated Socket.IO room subscriptions.
- Added a persistent custom Node server so Next.js API mutations and WebSocket clients use the same event bus.
- Fixed the mismatched channel message event name that prevented new messages from reaching subscribers.
- Added room membership checks before chat or call subscriptions are accepted.
- Replaced LiveKit with browser-native WebRTC, custom Socket.IO signaling, small-group mesh calls, screen sharing, and media-state controls.
- Reworked the product as **Nexus** with spaces, conversations, audio lounges, huddle rooms, a floating composer, and an original call canvas.
- Replaced Clerk with Auth.js 5 and added GitHub OAuth plus email/password registration and sign-in.
- Upgraded the stack to Next.js 16, React 19, Auth.js 5, Prisma 7, Tailwind CSS 4, React Query 5, and current supporting packages.
- Added a native Cloudflare WebSocket/polling transport, Neon adapter, private R2 uploads, and server-issued temporary TURN credentials.

## Requirements

- Node.js 20.19+, 22.12+, or 24+
- PostgreSQL
- A GitHub account for creating an OAuth application
- Cloudflare R2 and TURN for deployment (local uploads work without cloud accounts)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL` for your PostgreSQL database.

3. Generate `AUTH_SECRET` with this command:

   ```bash
   npx auth secret
   ```

   Keep this value private and stable. Changing it signs out existing sessions and prevents the Socket.IO server from decoding their cookies.

4. Complete the GitHub OAuth setup below, then add the generated client ID and client secret to `.env`.

5. Generate the Prisma client and apply the schema, including the Auth.js identity and password-hash fields:

   ```bash
   npm run db:generate
   npm run db:push
   ```

6. Start Nexus through its custom server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000` or the HTTP **Network** address printed at startup.
Development uses HTTP and does not generate or install certificates.
The current local network addresses are automatically allowed to load Next.js
development assets; restart the server after switching networks.

Camera and microphone access works on localhost. Calls from a second device
require an HTTPS deployment because browsers block media access on LAN HTTP.

## Portfolio demo

On the sign-in page, select **Fill dummy email**, then **Sign in with email**.
This fills intentionally public demo credentials and opens **Studio North**:

- Three text channels, video and audio rooms, three direct conversations, and four sample profiles.
- Prewritten messages, avatars, and message receipts, so visitors can explore immediately.
- Fully interactive: send/edit messages, upload files, invite people, manage rooms, and use voice/video calls with the same permissions as a regular workspace owner.

The sample workspace is created automatically in the configured database on the first
demo login. Subsequent visits reuse it without deleting or replacing existing chats.
No additional seed command or schema change is needed. The database must already be
configured and have the current project schema applied. The demo starts with membership
only in its sample workspace; the fictional people do not reply live.

The demo email and password in `lib/demo.ts` are public sample values, not secrets.
Never reuse them for a real account. No GitHub login or personal credentials are
needed to use the demo. This is a shared public account: visitors can see and change
its chats, so never use it for personal information or invite it into a private space.
Use a separate account and the space’s invite link for a second real participant.
The fictional teammates cannot answer messages or calls. Calls require browser media
permissions and HTTPS in a deployed app (or localhost for development); deployed
uploads use the R2 binding and deployed calls require the TURN secrets.

## GitHub login setup

1. Sign in to GitHub.
2. Open your profile menu and choose **Settings**.
3. In the left sidebar, open **Developer settings**.
4. Choose **OAuth Apps**, then select **New OAuth App**. If this is your first OAuth app, GitHub may label the button **Register a new application**.
5. Fill out the application:

   - **Application name:** `Nexus Local` or another recognizable name
   - **Homepage URL:** `http://localhost:3000`
   - **Application description:** optional
   - **Authorization callback URLs:**
     - `http://localhost:3000/api/auth/callback/github`
     - `http://YOUR_LAN_IP:3000/api/auth/callback/github`

   Replace `YOUR_LAN_IP` with the `Network` address printed by `npm run dev`. For example, if Nexus prints `http://10.158.74.207:3000`, add `http://10.158.74.207:3000/api/auth/callback/github`.

6. Leave Device Flow disabled; Nexus uses GitHub's browser-based web application flow.
7. Select **Register application**.
8. Copy the displayed **Client ID**.
9. Select **Generate a new client secret**, confirm if GitHub asks, and copy the secret immediately. GitHub will not show the complete secret again.
10. Put both values in `.env`:

    ```dotenv
    AUTH_GITHUB_ID="your-github-client-id"
    AUTH_GITHUB_SECRET="your-github-client-secret"
    ```

    Leave `AUTH_URL` unset during local development. Nexus will use the host that opened the page, allowing both `localhost` and the current LAN IP. Set `AUTH_URL` only for a deployed public HTTPS address.

11. Restart `npm run dev` after changing `.env` or the GitHub callback URLs.
12. Open either the local or network `/sign-in` address, select **Continue with GitHub**, approve the OAuth application, and confirm that GitHub returns you to the same Nexus address.

Each callback URL must match exactly, including the protocol, host, port, path, and absence of a trailing slash. GitHub supports multiple callback URLs; add both the localhost and LAN versions instead of enabling wildcard matching. For a deployment at `https://chat.example.com`, add:

```text
Homepage URL: https://chat.example.com
Authorization callback URL: https://chat.example.com/api/auth/callback/github
AUTH_URL=https://chat.example.com
```

Never commit `.env` or expose `AUTH_GITHUB_SECRET` in a variable whose name starts with `NEXT_PUBLIC_`.

## Email and password login

- New users open `/sign-up`, enter a display name, email address, password, and confirmation, then are signed in automatically.
- Returning users open `/sign-in` and use the same email and password.
- Email addresses are trimmed and normalized to lowercase. Passwords must contain 8–72 characters and are stored only as bcrypt hashes with cost factor 12.
- GitHub-only accounts do not receive a password automatically. If an email is already registered through another method, Auth.js intentionally asks the user to continue with the original method instead of silently linking accounts.

For a public production deployment, add email verification, password-reset email delivery, and distributed rate limiting at the reverse proxy or application boundary before inviting untrusted users.

## Realtime architecture

`server.ts` owns both Next.js and Socket.IO. The browser automatically sends its secure, HttpOnly Auth.js session cookie during the socket handshake. The server decrypts that cookie with `AUTH_SECRET`, identifies the user, and checks PostgreSQL membership before accepting a channel or direct-conversation subscription.

Message writes still go through authenticated HTTP handlers. After Prisma commits a create, edit, or delete, the handler publishes only to the authorized Socket.IO room. React Query is retained for history, caching, pagination, and reconnect reconciliation—not interval polling. Socket.IO first attempts WebSocket, can fall back to long-polling, retries indefinitely with bounded backoff, and restores rooms plus missed packets after short interruptions. If packet recovery is not possible, Nexus refreshes its server-backed sidebar state once after reconnecting.

That describes the local Node server. On Cloudflare, a Durable Object replaces the
server-local event bus, using hibernating native WebSockets and persisted HTTP polling
queues. Authenticated HTTP mutations publish through the `REALTIME` binding. Reconnect
rejoins rooms and reconciles message/sidebar state from Neon. See the deployment guide;
the custom Socket.IO Node process is not needed on Workers.

## Calls

Calls use native `RTCPeerConnection` APIs, with Socket.IO signaling locally or Durable
Object signaling on Cloudflare. Media travels directly between peers when possible,
or through TURN when required, encrypted by WebRTC. The mesh design is best for small
huddles (roughly two to six participants); larger rooms should eventually move to an SFU.

Browsers expose camera and microphone APIs only to secure contexts. `localhost`
is a special exception, but a LAN address such as `10.x.x.x` must use HTTPS and
its certificate must be trusted by the device opening Nexus.

Node development uses Cloudflare's public STUN endpoint if TURN is not configured.
For deployed cross-network calls, set the server-only `TURN_KEY_ID` and `TURN_API_TOKEN`.
The authenticated `/api/calls/ice` endpoint generates temporary relay credentials.
Never expose a permanent relay key through `NEXT_PUBLIC_*` variables.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm audit
```
