import { NextResponse } from "next/server";

/** Réponse JSON standard (messages en français, jamais de secret). */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, message: string, details?: string[]) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/** Extrait l'adresse IP depuis les en-têtes de la requête. */
export function requestIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() ?? "inconnu";
}

export function requestUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}
