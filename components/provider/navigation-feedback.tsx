"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";

type Navigation = {
  pendingHref: string | null;
  navigate(href: string, label?: string, prepare?: () => Promise<unknown>): void;
};
const Context = createContext<Navigation | null>(null);
export function useNavigationFeedback() {
  const context = useContext(Context);
  if (!context) throw new Error("NavigationFeedbackProvider is missing");
  return context;
}

export function NavigationFeedbackProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState({ href: "", label: "Opening…" });
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [pending, destination]);

  const navigate: Navigation["navigate"] = (href, label = "Opening…", prepare) => {
    const request = ++sequence.current;
    setDestination({ href, label });
    setSlow(false);
    setError(null);
    startTransition(async () => {
      try {
        await prepare?.();
        // React requires another transition after an async preparation step.
        if (request === sequence.current) startTransition(() => router.push(href));
      } catch {
        if (request === sequence.current) setError("Could not open this conversation. Please try again.");
      }
    });
  };

  return (
    <Context.Provider value={{ navigate, pendingHref: pending ? destination.href : null }}>
      {children}
      {pending && (
        <>
          <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[110] h-1 bg-primary/15">
            <div className="h-full bg-primary/70 motion-safe:animate-pulse" />
          </div>
          <div role="status" className="pointer-events-none fixed bottom-24 left-1/2 z-[110] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-primary motion-safe:animate-spin" />
            <div><p>{destination.label}</p>{slow && <p className="text-xs text-muted-foreground">Taking longer than usual. You can still use the sidebar.</p>}</div>
          </div>
        </>
      )}
      {error && (
        <div role="alert" className="fixed bottom-24 left-1/2 z-[110] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-lg">
          {error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss navigation error"><X className="h-4 w-4" /></button>
        </div>
      )}
    </Context.Provider>
  );
}
