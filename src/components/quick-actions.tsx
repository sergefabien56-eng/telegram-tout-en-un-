"use client";

import { ChevronDown, Plus, ShoppingCart, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { ShopCreateForm } from "@/components/shop-create-form";

/**
 * Actions rapides de la barre du haut.
 * - « Ajouter une boutique » : action réelle (modale → POST /api/shops).
 * - « Nouvelle commande » : module non branché → marqué « Bientôt disponible » (R1).
 */
export function QuickActions() {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function closeAll() {
    setOpen(false);
    setCreateOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="focusable inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Actions rapides</span>
        <ChevronDown className="hidden h-3.5 w-3.5 sm:inline" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            className="focusable flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-night hover:bg-surface"
          >
            <Store className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              Ajouter une boutique
              <span className="block text-xs text-muted">Jumia — Vendor Center</span>
            </span>
          </button>

          <div className="my-1 border-t border-border" aria-hidden="true" />

          {/* Module non branché : aucun bouton factice (R1). */}
          <div className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            <span>
              Nouvelle commande
              <span className="mt-0.5 block">
                <span className="badge bg-slate-100 text-muted">Bientôt disponible</span>
              </span>
            </span>
          </div>

          <div className="my-1 border-t border-border" aria-hidden="true" />

          <Link
            href="/boutiques"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="focusable flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-night hover:bg-surface"
          >
            <Store className="h-4 w-4 text-muted" aria-hidden="true" />
            Gérer mes boutiques
          </Link>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={closeAll}
        title="Ajouter une boutique"
        description="La boutique est créée avec le statut « en attente » jusqu'à la synchronisation Jumia."
      >
        {notice ? (
          <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>
        ) : null}
        <ShopCreateForm
          idPrefix="quick-shop"
          onCancel={closeAll}
          onCreated={() => {
            setNotice("Boutique créée. Tu es propriétaire.");
            window.setTimeout(() => {
              closeAll();
              window.location.href = "/boutiques";
            }, 700);
          }}
        />
      </Modal>
    </div>
  );
}
