"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

export function LoadingStatus({ label, hint = "Taking longer than usual. Please keep this page open." }: { label: string; hint?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary motion-safe:animate-spin" />
      <span>{label}{slow && <span className="block pt-1">{hint}</span>}</span>
    </div>
  );
}
