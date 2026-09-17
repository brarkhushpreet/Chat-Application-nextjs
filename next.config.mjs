import { networkInterfaces } from "node:os";

// Allow this machine's current addresses, including LAN and virtual adapters,
// without opening development assets to arbitrary origins.
const localAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === "IPv4")
  .map((address) => address.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
    devIndicators: false,
    // Auth.js has a workerd-specific export that Node's trace does not select.
    outputFileTracingIncludes: {
      "/*": ["./node_modules/@panva/hkdf/dist/**/*"],
    },
    images:{
        remotePatterns: [
            {
              protocol: "https",
              hostname: "uploadthing.com",
            },
            {
              protocol: "https",
              hostname: "utfs.io",
            },
          ],
    },
    allowedDevOrigins: [...new Set(["localhost", ...localAddresses])],

};

export default nextConfig;
