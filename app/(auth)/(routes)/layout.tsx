import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";
import { ArrowUpRight, CheckCheck, MessageSquare } from "lucide-react";

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main className="auth-page relative flex min-h-dvh items-center justify-center overflow-x-hidden px-5 py-24 sm:px-8">

      <div className="absolute left-5 top-5 z-10 flex items-center gap-3 sm:left-8 sm:top-7">
        <BrandMark />
        <span className="text-sm font-extrabold tracking-tight">Nexus</span>
      </div>

      <div className="absolute right-5 top-5 z-10 sm:right-8 sm:top-7"><ModeToggle /></div>

      <section className="relative z-10 grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-[1fr_440px] lg:gap-20">
        <div className="hidden lg:block">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"><MessageSquare className="h-3.5 w-3.5 text-primary" /> A little space for your team</span>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.12] tracking-[-0.045em] text-foreground">Good conversations<br /><span className="text-primary">start here.</span></h1>
          <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">Bring your people, ideas, and everyday updates together. One thoughtful workspace, from the first hello.</p>

          <div className="auth-preview mt-10 max-w-md overflow-hidden rounded-2xl border">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5"><span className="text-sm font-semibold text-foreground"># design-studio</span><span className="text-xs text-muted-foreground">Sample conversation</span></div>
            <div className="space-y-5 p-5">
              <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e0ece4] text-[11px] font-bold text-[#3c6550]">MC</span><div><p className="text-xs font-semibold text-foreground">Maya Chen <span className="ml-2 font-normal text-muted-foreground">10:42</span></p><p className="mt-1.5 rounded-xl rounded-tl-sm bg-muted px-3 py-2.5 text-sm leading-6 text-foreground">A calmer workspace. More room for the ideas that matter.</p></div></div>
              <div className="ml-12 flex flex-col items-end"><p className="rounded-xl rounded-br-sm bg-primary px-3 py-2.5 text-sm text-primary-foreground">This feels like a good place to start.</p><span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CheckCheck className="h-3.5 w-3.5 text-primary" /> Read</span></div>
            </div>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5" /> Try the portfolio demo. No account needed.</p>
        </div>
        <div className="flex w-full justify-center">{children}</div>
      </section>

      <p className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-xs font-medium tracking-wide text-muted-foreground">
        Nexus · Made for staying in touch
      </p>
    </main>
  );
};

export default AuthLayout;
