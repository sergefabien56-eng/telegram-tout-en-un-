"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Section repliable.
 *
 * Sert à garder une page lisible : les listes longues sont repliées par
 * défaut, mais restent accessibles en un clic et restent navigables au
 * clavier (bouton natif + `aria-expanded` + `aria-controls`).
 */
export function Collapsible({
  title,
  description,
  children,
  defaultOpen = false,
  /** Texte du bouton quand la section est repliée. */
  openLabel = "Afficher",
  closeLabel = "Masquer",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  openLabel?: string;
  closeLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-night">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={id}
          className="focusable inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-night hover:bg-surface"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {open ? closeLabel : openLabel}
        </button>
      </div>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
