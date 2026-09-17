import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Authenticated chat pages are dynamic; no public incremental cache is needed.
export default {
  ...defineCloudflareConfig({}),
  // Avoid Turbopack's package-alias symlinks in the Worker trace on Windows.
  buildCommand: "npm run build -- --webpack",
};
