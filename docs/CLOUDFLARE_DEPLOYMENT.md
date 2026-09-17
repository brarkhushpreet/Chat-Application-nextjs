# Deploy Nexus on Cloudflare + Neon

This deployment does **not** need a VPS, Workers VPC, Hyperdrive, LiveKit, or UploadThing.
Nothing is deployed by installing dependencies or running the build commands.

| Feature | Deployment service |
| --- | --- |
| Next.js pages, HTTP APIs, Auth.js/GitHub/password login | Cloudflare Worker, packaged with OpenNext |
| Chat events, unread/read updates, new conversations, room changes | Hibernating WebSockets in a SQLite Durable Object |
| Automatic reconnect and HTTP polling fallback | Same Durable Object, with persisted polling queues |
| Users, memberships, messages, read state, demo fixtures | Neon PostgreSQL through Prisma's Neon adapter |
| New image/PDF uploads | Private Cloudflare R2 bucket, authenticated download route |
| Voice, video, screen sharing | Existing native WebRTC mesh; Cloudflare TURN when a direct connection is impossible |

The Node/Socket.IO server remains available for `npm run dev`. It is **not** run on
Cloudflare. Deployed browsers discover the Worker transport automatically; no public
WebSocket URL or separate server is needed. The demo retains the same chat/call features.

## 1. Understand the cost boundary first

**A fully functional $0 deployment is not guaranteed.** The verified dry-run measured
approximately 19.4 MiB uncompressed (5.3 MiB compressed). Cloudflare's current limit is
64 MiB uncompressed on both Free and Paid; there is no compressed-size limit, so the
bundle fits either plan. Older 3 MiB/10 MiB compressed-limit advice is outdated.
Workers Free still has a 10 ms CPU budget per request; Next.js rendering and bcrypt
cost-12 password verification can exceed it. Measure real authentication/rendering
requests before relying on Free. Workers Paid currently has a $5/month minimum if
needed. Do not weaken password hashing to fit Free. Usage beyond included
allowances can cost extra. This configuration does not purchase or activate a plan.

R2 Standard currently includes 10 GB-month of storage, 1 million Class A operations,
and 10 million Class B operations per month, with free direct egress. TURN currently
has a 1,000 GB free tier, then usage charges; check the dashboard's terms before enabling
it. Neon also has quotas and scale-to-zero cold starts. These are allowances, not an
unlimited or guaranteed $0 hosting promise.

Official references: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[TURN FAQ/pricing](https://developers.cloudflare.com/realtime/turn/faq/),
[Neon plans](https://neon.com/pricing).

## 2. Prepare Neon without losing existing data

1. Create/select a Neon project and a PostgreSQL database. Choose a region reasonably
   close to your users. Use a separate branch/database for local preview.
2. In Neon's connection dialog, choose the database and role. The pooled connection
   string is the Worker's `DATABASE_URL`; retain `sslmode=require` and other supplied
   query parameters. It must point at your Neon hostname, not `localhost`.
3. For schema-management commands, use the direct/unpooled connection string as
   `DIRECT_DATABASE_URL` in your local, ignored `.env`. Keep these values private.
4. **Fresh empty database only:** run `npm run db:generate`, then `npm run db:push`.
   The Prisma schema already uses PostgreSQL; no D1 conversion is involved.
5. **Existing data:** take a backup, migrate/import the existing PostgreSQL data into
   Neon, and review Prisma's proposed schema changes before applying them. Do not use
   `--force-reset` or `--accept-data-loss`. Pointing at an empty Neon database does not
   copy your current users, passwords, messages, or memberships.

The demo is created on its first successful demo login. Fictional demo people cannot
answer calls; use a second real account/browser/device and an invite link for call tests.

## 3. Prepare Cloudflare resources

These steps create account resources; perform them yourself only after accepting their
applicable pricing. Use **Workers & Pages**, not Workers VPC or a static Pages project.

1. Sign in to your Cloudflare account with `npx wrangler login`.
2. Enable R2 if needed. Create a **Standard**, private bucket named `nexus-uploads`,
   or choose your own name and update `r2_buckets[0].bucket_name` in `wrangler.jsonc`.
   No public bucket URL, R2 API key, CORS rule, or custom domain is needed: the Worker
   uses its binding and checks file access before returning bytes.
3. In Cloudflare Realtime's **TURN** section, create a TURN key. Record its key ID and
   corresponding API token privately. Do not use a RealtimeKit app ID or expose this
   token in `NEXT_PUBLIC_*` variables.
4. Choose a Worker name. The default is `nexus-chat`. If you change it, update both
   `name` and `services[0].service` in `wrangler.jsonc` to the same name.
5. The `REALTIME` binding and `v1` SQLite Durable Object migration are created on the
   first deployment. Keep migration history intact on later releases. Do not rename
   or delete this class to reset the app.

## 4. Configure secrets and GitHub OAuth

Use the Cloudflare dashboard's **Worker → Settings → Variables and Secrets**, or the
interactive Wrangler commands below. Do not paste secrets into source code, screenshots,
chat, command-line arguments, or Git. Wrangler prompts for each value privately.

```sh
npx wrangler secret put DATABASE_URL
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUTH_GITHUB_ID
npx wrangler secret put AUTH_GITHUB_SECRET
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_API_TOKEN
```

If Wrangler offers to create the named Worker for its first secret, confirm only when
you intend to create that resource. No secret value belongs in `wrangler.jsonc`.
Generate a long random `AUTH_SECRET` locally and keep it stable across deployments.
An existing Node deployment must use the same secret if you intend to keep its sessions.

Once you know the public origin (for example `https://nexus-chat.YOUR-SUBDOMAIN.workers.dev`),
set `AUTH_URL` to exactly that HTTPS origin in the Worker's dashboard. Alternatively,
add it as a non-secret `vars` entry in `wrangler.jsonc`. Do not leave it pointing to
localhost, a LAN address, or the old host. Wrangler deployments manage vars from the
config, so keep your chosen `AUTH_URL` there for subsequent deployments.

For GitHub, create a production **OAuth App** in GitHub → Settings → Developer settings
→ OAuth Apps. Use your production origin as Homepage URL and:

```text
https://YOUR-PUBLIC-HOST/api/auth/callback/github
```

as the callback/redirect URL. Put that app's Client ID and generated Client Secret into
the two `AUTH_GITHUB_*` secrets. Keep a separate OAuth app for localhost if convenient.
Credentials and demo login do not require GitHub, but GitHub login needs these settings.

## 5. Build and preview before deploying

Use Node 24 LTS. Linux/macOS or WSL with **Linux Node/npm installed** is recommended
by OpenNext. Do not reuse Windows `node_modules` from Linux. In WSL, prefer a checkout
inside the Linux filesystem and run `npm ci` there. Never commit/copy real `.env` files
to a remote build system; configure its private environment settings yourself.

```sh
npm ci
npm run cf:build
```

The Cloudflare build selects Webpack explicitly, avoiding Turbopack's traced package
symlinks on Windows. `npm run dev` still uses the normal Next development workflow.
The generated `.open-next` directory is ignored by Git.

For a local Workers-runtime preview, copy `.dev.vars.example` to `.dev.vars`, fill it
yourself with a **test Neon database** and local-only secrets, then run:

```sh
npm run cf:preview
```

Wrangler emulates R2 and Durable Objects locally. Neon is **not** emulated: preview
really queries whichever database you configure. Local R2 files are separate from both
deployed R2 and the Node development server's `.local/uploads` directory. Leave `AUTH_URL`
unset for preview and use a localhost GitHub callback matching the port Wrangler prints.
Without `.dev.vars`, Wrangler can load `.env`; ensure it does not point to production.
Do not print or commit `.dev.vars`.

## 6. Deploy when ready

After configuring the database, bucket, TURN, secrets, and OAuth URLs, run:

```sh
npm run cf:deploy
```

This command **does** publish the app and apply the Durable Object migration. A Workers
`workers.dev` HTTPS address is sufficient; buying a domain or changing DNS is optional.
In Cloudflare Git builds, use `npm run cf:build` as the build command and
`npx opennextjs-cloudflare deploy` as the deploy command. Configure runtime secrets in
the Worker; do not expose them as public build variables.

## 7. Verify the live app before adding it to your resume

- Open the HTTPS site in two separate browser profiles. Test GitHub, registration,
  credentials, and the shared demo login. Bad credentials must show an error.
- Join the same space using different users; send/edit/delete a message. Check new
  conversations/rooms, unread badges, and read receipts without reloading.
- Toggle offline/online in browser devtools. The connection should recover, rejoin
  rooms, and refetch messages. Blocking WebSocket handshakes should activate HTTP
  polling; allowing them again should upgrade back to WebSocket automatically.
- Upload an image/PDF and check the recipient can open it, but an unrelated account
  cannot. An existing UploadThing URL still resolves from its original provider; it
  has **not** been copied automatically. Copy legacy assets and update database URLs
  before deleting your old storage account. The same applies to local development files.
- Test microphone, video, screen sharing, leave/rejoin, and reconnect with two real
  users on different networks (e.g. Wi-Fi and mobile data). In WebRTC diagnostics,
  verify a `relay` candidate is used when a direct route is unavailable.
- Check Worker CPU/errors, Durable Object usage, R2 operations/storage, Neon usage,
  and TURN traffic. Enable appropriate budget alerts and abuse protection yourself.

## Limits and security notes

- The coordinator is intentionally one Durable Object for a portfolio/small-team app.
  It is not a promise of unlimited scale. Large installations need sharded room/user
  coordination; small mesh calls still depend on each participant's upload bandwidth.
- WebSocket and polling sessions are authenticated with the same HttpOnly Auth.js JWT.
  The Worker rejects cross-origin handshakes/posts; room joins and call signaling check
  membership. Internal publication endpoints are not exposed as public routes.
- Polling queues are bounded. If a client falls behind, it resynchronizes with Neon;
  Neon is the durable message history, not the socket queue. Brief reconnects can
  interrupt a call while peers renegotiate; there is no zero-downtime guarantee.
- Cloudflare deployments require TURN configuration for call setup rather than silently
  offering unreliable STUN-only calling. Node development can use STUN without TURN.
  Temporary credentials are refreshed during long calls. Browser permissions and
  HTTPS are still required; no host can bypass those browser restrictions.
- The guest account is public and fully interactive, as requested. Its users can edit
  shared data, upload, and consume relay bandwidth. Never put personal information in
  it. Uploads are limited to 8 MB each and approved image/PDF formats, but that is not
  a spending cap. Add account/IP rate limits and monitor usage before wide promotion.
- No password-reset/email-verification service has been introduced by this migration.
- The retained Prisma CLI dependency currently has a transitive `mysql2` advisory;
  this application uses PostgreSQL. Do not run `npm audit fix --force` to downgrade
  Prisma across major versions. Review upstream patches separately.

Implementation references: [OpenNext setup](https://opennext.js.org/cloudflare/get-started),
[custom Workers](https://opennext.js.org/cloudflare/howtos/custom-worker),
[hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[temporary TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/).
