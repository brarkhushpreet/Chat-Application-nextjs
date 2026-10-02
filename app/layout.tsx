
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/provider/theme-provider";
import { cn } from "@/lib/utils";
import { ModalProvider } from "@/components/provider/modal-provider";
import { SocketProvider } from "@/components/provider/socket-provider";
import { QueryProvider } from "@/components/provider/query-provider";
import { IncomingCallNotification } from "@/components/incoming-call-notification";
import { NavigationFeedbackProvider } from "@/components/provider/navigation-feedback";


const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Nexus — conversations with momentum",
  description: "A realtime space for thoughtful teams, chats, and huddles.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en"  suppressHydrationWarning>
      <body className={cn(sans.className, sans.variable)}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="nexus-theme"
        >
        <SocketProvider>
        <NavigationFeedbackProvider>
        <IncomingCallNotification />
        <ModalProvider/>
        <QueryProvider>
        {children}
        </QueryProvider> 
        </NavigationFeedbackProvider>
        </SocketProvider>
        </ThemeProvider>
        </body>
    </html>
  );
}
