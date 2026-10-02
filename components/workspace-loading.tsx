import { LoaderCircle } from "lucide-react";

export function WorkspaceLoading() {
  return (
    <section aria-busy="true" aria-label="Loading conversation" className="flex h-full min-h-64 flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground">
      <div role="status" className="flex items-center gap-3 border-b border-border pb-5 text-sm">
        <LoaderCircle aria-hidden="true" className="h-4 w-4 text-primary motion-safe:animate-spin" />
        Opening your conversation…
      </div>
      <div aria-hidden="true" className="flex flex-1 flex-col justify-end gap-5 py-8 motion-safe:animate-pulse">
        {["w-2/3", "ml-auto w-1/2", "w-1/2"].map((width, index) => (
          <div key={index} className={`${width} max-w-lg rounded-2xl bg-muted p-4`}>
            <div className="mb-3 h-2 w-20 rounded bg-foreground/10" />
            <div className="h-2 w-4/5 rounded bg-foreground/10" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="h-12 rounded-xl bg-muted motion-safe:animate-pulse" />
    </section>
  );
}
