"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Bouton « Marquer comme vue » d'une alerte de commande.
 *
 * La lecture est **personnelle** : marquer une alerte comme vue n'affecte
 * que l'utilisateur connecté. Les autres membres de la boutique la voient
 * toujours comme non vue, tant qu'ils ne l'ont pas ouverte eux-mêmes.
 */
export function MarkAlertReadButton({
  alertId,
  label = "Marquer comme vue",
}: {
  alertId: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      await fetch(`/api/order-alerts/${alertId}/read`, { method: "POST" });
      router.refresh();
    } catch {
      // L'état est rechargé par le serveur : rien à faire ici.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void mark()}
      disabled={busy}
      className="focusable rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-night hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}
