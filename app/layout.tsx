
import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/ui/provider/theme-provider";
import { cn } from "@/lib/utils";

const sans =Open_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chat Application",
  description: "For learning and educational purposes only",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
    <html lang="en"  suppressHydrationWarning>
      <body className={cn(sans.className,
      "bg-white dark:bg-[#313338]")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="chat-application"
        >
        {children}
        </ThemeProvider>
        </body>
    </html>
    </ClerkProvider>
  );
}
