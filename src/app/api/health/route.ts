import { NextResponse } from "next/server";
import { configPresence } from "@/config/env";

export const dynamic = "force-dynamic";

/** État de santé réel — n'expose jamais de secret, uniquement des présences. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "tout-en-un-business-manager",
    phase: "P1",
    timestamp: new Date().toISOString(),
    config: configPresence(process.env),
  });
}
