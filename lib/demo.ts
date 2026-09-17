// These are intentionally public, non-sensitive portfolio demo credentials.
// The account is shared by visitors. Never use it for private conversations.
export const DEMO_EMAIL = "guest@nexus.example";
export const DEMO_PASSWORD = "ExploreNexus2026!";
export const DEMO_USER_ID = "nexus-demo-guest";
export const DEMO_SERVER_ID = "nexus-demo-studio";
export const DEMO_ENTRY_PATH = `/servers/${DEMO_SERVER_ID}/channels/nexus-demo-general`;

export const demoPeople = [
  { key: "guest", name: "Portfolio Guest", initials: "PG", color: "violet" },
  { key: "maya", name: "Maya Chen", initials: "MC", color: "green" },
  { key: "alex", name: "Alex Rivera", initials: "AR", color: "blue" },
  { key: "sam", name: "Sam Patel", initials: "SP", color: "orange" },
] as const;

export const demoChannels = [
  { key: "general", name: "general", type: "TEXT" },
  { key: "design", name: "design-studio", type: "TEXT" },
  { key: "shipping", name: "shipping-this-week", type: "TEXT" },
  { key: "video", name: "video-huddle", type: "VIDEO" },
  { key: "audio", name: "coffee-lounge", type: "AUDIO" },
] as const;

// Fictional conversations; the people below are sample personas, not live users.
export const demoMessages = [
  { room: "general", person: "maya", content: "Welcome to Studio North 👋 This is our little corner for ideas, design reviews, and the occasional small win." },
  { room: "general", person: "alex", content: "Morning team! The new onboarding flow is ready for a first look. I kept the setup down to three steps." },
  { room: "general", person: "sam", content: "Tried it on my phone — the shorter form makes a big difference. Nice work." },
  { room: "general", person: "guest", content: "Just joined. I’m taking a look around the workspace!", state: "read" },
  { room: "general", person: "maya", content: "Glad you’re here! Open design-studio for our latest review, or check your direct messages for a quick tour." },
  { room: "general", person: "alex", content: "Small win for today: the release checklist is finally all green. 🎉" },
  { room: "general", person: "guest", content: "Love how everything stays in one place. The design channel is next on my list.", state: "read" },
  { room: "general", person: "sam", content: "For anyone exploring: all the people and conversations in this demo are fictional. Feel free to browse the rooms and switch themes." },
  { room: "design", person: "maya", content: "Design review: a quieter workspace.\n\n• Warm neutral navigation\n• Clearer message contrast\n• One accent color for actions\n\nThe goal is to make the conversation the focus." },
  { room: "design", person: "sam", content: "The direction feels good. Could we keep the timestamps readable without making them compete with the message?" },
  { room: "design", person: "guest", content: "Agreed. I’d also keep a visible focus state for keyboard navigation.", state: "read" },
  { room: "design", person: "maya", content: "Done. I’ve included both in the next pass. The theme switch is in the navigation rail if you want to compare." },
  { room: "design", person: "alex", content: "The latest pass is ready for a review. I especially like the smaller welcome panel." },
  { room: "shipping", person: "alex", content: "This week’s plan\n\nMonday — finish the conversation layout\nTuesday — review empty and error states\nWednesday — check reconnect behavior\nFriday — share the portfolio demo" },
  { room: "shipping", person: "sam", content: "I’ll take the mobile pass. We should check long names and messages too." },
  { room: "shipping", person: "maya", content: "I’ll review the light and dark themes. Keeping this release small and focused." },
  { room: "shipping", person: "guest", content: "I’ll walk through the demo from a reviewer’s perspective.", state: "delivered" },
  { room: "shipping", person: "alex", content: "Perfect. The sample workspace now has group conversations, private messages, and read receipts to explore." },
] as const;

export const demoDirectMessages = [
  { other: "maya", person: "maya", content: "Hey! Welcome to the Nexus demo. I’m Maya, the sample designer in this workspace." },
  { other: "maya", person: "guest", content: "Thanks! Where should I start?", state: "read" },
  { other: "maya", person: "maya", content: "Start in general, then open design-studio. You can compare the themes, browse messages, and see how private conversations are organized." },
  { other: "maya", person: "maya", content: "You can send messages, create rooms, and try calls here. Invite a real participant to test live chat or video — the sample teammates won’t reply. This guest account is shared, so don’t post personal information." },
  { other: "alex", person: "alex", content: "Hi! I’m Alex, the sample engineer. This conversation shows what a direct message thread looks like." },
  { other: "alex", person: "guest", content: "Does the app use realtime messaging?", state: "read" },
  { other: "alex", person: "alex", content: "Yes — Socket.IO handles live updates and reconnects. Calls use browser WebRTC with custom signaling. The people in this preview are fictional, so we won’t reply live." },
  { other: "sam", person: "sam", content: "Welcome! I’m Sam, the sample product teammate. The shipping-this-week room has our release plan." },
] as const;
