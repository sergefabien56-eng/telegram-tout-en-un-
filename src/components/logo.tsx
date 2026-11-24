import { cn } from "@/lib/cn";

/** Logo TOUT EN UN (marque + nom). Purement présententiel. */
export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-bold text-white"
      >
        TU
      </span>
      {withName && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold text-night">TOUT EN UN</span>
          <span className="block text-[11px] font-medium text-muted">Business Manager</span>
        </span>
      )}
    </div>
  );
}
