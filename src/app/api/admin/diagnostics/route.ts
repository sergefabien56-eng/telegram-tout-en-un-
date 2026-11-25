import { audit } from "@/lib/audit";
import { diagnosticReport, repairShop } from "@/lib/diagnostics";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { hasAdminAccess } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/diagnostics — rapport de diagnostic multiboutique.
 *
 * `?deep=1` interroge réellement Jumia (preuve de cohérence + test du compte
 * vendeur). Sans ce paramètre, seuls les contrôles locaux sont faits.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  if (!(await hasAdminAccess(user.id))) {
    return fail(403, "Diagnostic réservé aux propriétaires et gestionnaires.");
  }

  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const shopId = url.searchParams.get("boutique") ?? undefined;

  const report = await diagnosticReport({ userId: user.id, deep, shopId });

  await audit({
    action: "admin.diagnostic_run",
    result: "success",
    userId: user.id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { deep, shopId: shopId ?? null, anomalies: report.summary.anomalies },
  });

  return ok(report);
}

/**
 * POST /api/admin/diagnostics — action corrective.
 *
 * Corps : `{ shopId, action: "resync" }`.
 * Une sauvegarde de la base est produite avant l'écriture, et l'opération est
 * journalisée.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  if (!(await hasAdminAccess(user.id))) {
    return fail(403, "Action réservée aux propriétaires et gestionnaires.");
  }

  let body: { shopId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }
  const shopId = typeof body.shopId === "string" ? body.shopId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!shopId) return fail(422, "Boutique manquante.");
  if (action !== "resync") return fail(422, "Action inconnue.");

  const result = await repairShop({ userId: user.id, shopId });
  if (!result.ok && result.error) return fail(400, result.error);
  return ok(result);
}
