-- Nexus portfolio demo: paste this ENTIRE script into Neon's SQL Editor.
-- Select the branch/database used by your deployed Worker's DATABASE_URL.
-- Requires the existing Prisma schema in public (run db:push separately first).
-- Inserts only missing demo rows; existing messages and read state are preserved.
-- An unexpected unique-ID/email conflict aborts the transaction: do not delete
-- existing users to work around it. Check the database/branch and conflicting row.
-- Fictional profiles intentionally do not have login-capable User records.
-- The app handles the intentionally public guest credentials; no password is
-- stored here. This does not disable ensureDemoWorkspace() on guest sign-in.

BEGIN;

INSERT INTO public."User" ("id", "name", "email", "image")
VALUES ('nexus-demo-guest', 'Portfolio Guest', 'guest@nexus.example', '/demo/guest.svg')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public."Profile"
  ("id", "userId", "name", "imageUrl", "email", "createdAt", "updatedAt")
SELECT
  'nexus-demo-profile-' || p.key,
  CASE WHEN p.key = 'guest' THEN 'nexus-demo-guest'
       ELSE 'nexus-demo-person-' || p.key END,
  p.name, '/demo/' || p.key || '.svg',
  CASE WHEN p.key = 'guest' THEN 'guest@nexus.example'
       ELSE p.key || '@nexus.example' END,
  NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
FROM (VALUES
  ('guest', 'Portfolio Guest'),
  ('maya', 'Maya Chen'),
  ('alex', 'Alex Rivera'),
  ('sam', 'Sam Patel')
) AS p(key, name)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public."Server"
  ("id", "name", "imageUrl", "inviteCode", "profileId", "createdAt", "updatedAt")
VALUES (
  'nexus-demo-studio', 'Studio North', '/demo/studio.svg',
  'nexus-demo-preview', 'nexus-demo-profile-guest',
  NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public."Member"
  ("id", "role", "profileId", "serverId", "createdAt", "updatedAt")
SELECT
  'nexus-demo-member-' || p.key,
  (CASE WHEN p.key = 'guest' THEN 'ADMIN' ELSE 'GUEST' END)::public."MemberRole",
  'nexus-demo-profile-' || p.key, 'nexus-demo-studio',
  NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
FROM (VALUES
  ('guest'),
  ('maya'),
  ('alex'),
  ('sam')
) AS p(key)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public."Channel"
  ("id", "name", "type", "profileId", "serverId", "createdAt", "updatedAt")
SELECT
  'nexus-demo-' || c.key, c.name, c.type::public."ChannelType",
  'nexus-demo-profile-guest', 'nexus-demo-studio',
  NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
FROM (VALUES
  ('general', 'general', 'TEXT'),
  ('design', 'design-studio', 'TEXT'),
  ('shipping', 'shipping-this-week', 'TEXT'),
  ('video', 'video-huddle', 'VIDEO'),
  ('audio', 'coffee-lounge', 'AUDIO')
) AS c(key, name, type)
ON CONFLICT ("id") DO NOTHING;

WITH samples(idx, room, person, content, was_read) AS (VALUES
  (0, 'general', 'maya', 'Welcome to Studio North 👋 This is our little corner for ideas, design reviews, and the occasional small win.', true),
  (1, 'general', 'alex', 'Morning team! The new onboarding flow is ready for a first look. I kept the setup down to three steps.', true),
  (2, 'general', 'sam', 'Tried it on my phone — the shorter form makes a big difference. Nice work.', true),
  (3, 'general', 'guest', 'Just joined. I’m taking a look around the workspace!', true),
  (4, 'general', 'maya', 'Glad you’re here! Open design-studio for our latest review, or check your direct messages for a quick tour.', true),
  (5, 'general', 'alex', 'Small win for today: the release checklist is finally all green. 🎉', true),
  (6, 'general', 'guest', 'Love how everything stays in one place. The design channel is next on my list.', true),
  (7, 'general', 'sam', 'For anyone exploring: all the people and conversations in this demo are fictional. Feel free to browse the rooms and switch themes.', true),
  (8, 'design', 'maya', 'Design review: a quieter workspace.

• Warm neutral navigation
• Clearer message contrast
• One accent color for actions

The goal is to make the conversation the focus.', true),
  (9, 'design', 'sam', 'The direction feels good. Could we keep the timestamps readable without making them compete with the message?', true),
  (10, 'design', 'guest', 'Agreed. I’d also keep a visible focus state for keyboard navigation.', true),
  (11, 'design', 'maya', 'Done. I’ve included both in the next pass. The theme switch is in the navigation rail if you want to compare.', true),
  (12, 'design', 'alex', 'The latest pass is ready for a review. I especially like the smaller welcome panel.', true),
  (13, 'shipping', 'alex', 'This week’s plan

Monday — finish the conversation layout
Tuesday — review empty and error states
Wednesday — check reconnect behavior
Friday — share the portfolio demo', true),
  (14, 'shipping', 'sam', 'I’ll take the mobile pass. We should check long names and messages too.', true),
  (15, 'shipping', 'maya', 'I’ll review the light and dark themes. Keeping this release small and focused.', true),
  (16, 'shipping', 'guest', 'I’ll walk through the demo from a reviewer’s perspective.', false),
  (17, 'shipping', 'alex', 'Perfect. The sample workspace now has group conversations, private messages, and read receipts to explore.', true)
), timed AS (
  SELECT *, (NOW() AT TIME ZONE 'UTC') - INTERVAL '90 minutes'
    + idx * INTERVAL '3 minutes' AS sent_at
  FROM samples
)
INSERT INTO public."Message"
  ("id", "content", "memberId", "channelId", "deleted",
   "createdAt", "updatedAt", "deliveredAt", "readAt")
SELECT
  'nexus-demo-message-' || idx, content,
  'nexus-demo-member-' || person, 'nexus-demo-' || room, false,
  sent_at, sent_at, sent_at + INTERVAL '1 second',
  CASE WHEN was_read THEN sent_at + INTERVAL '3 seconds' ELSE NULL END
FROM timed
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public."Conversation" ("id", "memberOneId", "memberTwoId")
SELECT
  'nexus-demo-dm-' || p.key,
  'nexus-demo-member-guest', 'nexus-demo-member-' || p.key
FROM (VALUES ('maya'), ('alex'), ('sam')) AS p(key)
ON CONFLICT ("id") DO NOTHING;

WITH samples(idx, other_person, person, content, was_read) AS (VALUES
  (0, 'maya', 'maya', 'Hey! Welcome to the Nexus demo. I’m Maya, the sample designer in this workspace.', true),
  (1, 'maya', 'guest', 'Thanks! Where should I start?', true),
  (2, 'maya', 'maya', 'Start in general, then open design-studio. You can compare the themes, browse messages, and see how private conversations are organized.', true),
  (3, 'maya', 'maya', 'You can send messages, create rooms, and try calls here. Invite a real participant to test live chat or video — the sample teammates won’t reply. This guest account is shared, so don’t post personal information.', true),
  (4, 'alex', 'alex', 'Hi! I’m Alex, the sample engineer. This conversation shows what a direct message thread looks like.', true),
  (5, 'alex', 'guest', 'Does the app use realtime messaging?', true),
  (6, 'alex', 'alex', 'Yes — live updates reconnect automatically, with polling as a fallback. Calls use browser WebRTC with custom signaling. The people in this preview are fictional, so we won’t reply live.', true),
  (7, 'sam', 'sam', 'Welcome! I’m Sam, the sample product teammate. The shipping-this-week room has our release plan.', true)
), timed AS (
  SELECT *, (NOW() AT TIME ZONE 'UTC') - INTERVAL '90 minutes'
    + (idx + 18) * INTERVAL '3 minutes' AS sent_at
  FROM samples
)
INSERT INTO public."DirectMessage"
  ("id", "content", "memberId", "conversationId", "deleted",
   "createdAt", "updatedAt", "deliveredAt", "readAt")
SELECT
  'nexus-demo-dm-message-' || idx, content,
  'nexus-demo-member-' || person, 'nexus-demo-dm-' || other_person, false,
  sent_at, sent_at, sent_at + INTERVAL '1 second',
  CASE WHEN was_read THEN sent_at + INTERVAL '3 seconds' ELSE NULL END
FROM timed
ON CONFLICT ("id") DO NOTHING;

-- Initial guest unread badges: leave shipping and Sam's DM unread.
-- Only consider seed messages, never mark visitors' later messages as read.
INSERT INTO public."ChannelReadState" ("id", "memberId", "channelId", "lastReadAt")
SELECT
  'nexus-demo-read-' || c.key, 'nexus-demo-member-guest',
  'nexus-demo-' || c.key, MAX(m."createdAt") + INTERVAL '1 second'
FROM (VALUES ('general'), ('design')) AS c(key)
JOIN public."Message" m ON m."channelId" = 'nexus-demo-' || c.key
WHERE m."id" LIKE 'nexus-demo-message-%'
GROUP BY c.key
ON CONFLICT ("memberId", "channelId") DO NOTHING;

INSERT INTO public."ConversationReadState" ("id", "memberId", "conversationId", "lastReadAt")
SELECT
  'nexus-demo-read-dm-' || p.key, 'nexus-demo-member-guest',
  'nexus-demo-dm-' || p.key, MAX(m."createdAt") + INTERVAL '1 second'
FROM (VALUES ('maya'), ('alex')) AS p(key)
JOIN public."DirectMessage" m ON m."conversationId" = 'nexus-demo-dm-' || p.key
WHERE m."id" LIKE 'nexus-demo-dm-message-%'
GROUP BY p.key
ON CONFLICT ("memberId", "conversationId") DO NOTHING;

COMMIT;

-- On a fresh database these counts should be 1, 4, 5, 18, 3, and 8.
SELECT
  (SELECT COUNT(*) FROM public."User" WHERE "id" = 'nexus-demo-guest') AS guest_users,
  (SELECT COUNT(*) FROM public."Member" WHERE "serverId" = 'nexus-demo-studio') AS members,
  (SELECT COUNT(*) FROM public."Channel" WHERE "serverId" = 'nexus-demo-studio') AS channels,
  (SELECT COUNT(*) FROM public."Message" WHERE "id" LIKE 'nexus-demo-message-%') AS sample_channel_messages,
  (SELECT COUNT(*) FROM public."Conversation" WHERE "id" IN ('nexus-demo-dm-maya', 'nexus-demo-dm-alex', 'nexus-demo-dm-sam')) AS sample_conversations,
  (SELECT COUNT(*) FROM public."DirectMessage" WHERE "id" LIKE 'nexus-demo-dm-message-%') AS sample_direct_messages;

