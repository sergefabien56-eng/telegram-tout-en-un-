import { NextResponse } from "next/server";
import { configPresence } from "@/config/env";
import { getMigrationStatus } from "@/lib/db-migrate";

export const dynamic = "force-dynamic";

/** État de santé réel — n'expose jamais de secret, uniquement des présences. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "tout-en-un-business-manager",
    phase: "P1",
    timestamp: new Date().toISOString(),
    config: configPresence(process.env),
    // Les migrations sont appliquées au démarrage : on publie le résultat
    // pour qu'un échec soit visible immédiatement, pas caché.
    migrations: getMigrationStatus() ?? {
      ok: true,
      applied: 0,
      error: "non encore exécutées",
    },
  });
}
