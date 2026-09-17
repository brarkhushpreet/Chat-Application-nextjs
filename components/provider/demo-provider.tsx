"use client";

import { createContext, useContext } from "react";
import { signOut } from "next-auth/react";
import { Eye, ArrowUpRight } from "lucide-react";

const DemoContext = createContext(false);
export const useDemo = () => useContext(DemoContext);

export function DemoProvider({ isDemo, children }: { isDemo: boolean; children: React.ReactNode }) {
  return <DemoContext.Provider value={isDemo}>{children}</DemoContext.Provider>;
}

export function DemoBanner() {
  const isDemo = useDemo();
  if (!isDemo) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-5 py-2.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /><strong className="text-foreground">Live demo</strong><span className="hidden sm:inline">Shared guest account · Try chat & calls · Don’t share personal information</span></span>
      <button type="button" onClick={() => void signOut({ redirectTo: "/sign-in" })} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
        Exit demo <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
