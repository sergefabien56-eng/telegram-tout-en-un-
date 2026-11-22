import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { acceptInvite } from "@/lib/shops";
import { z } from "zod";
import { audit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(10).max(200) });

/** POST /api/shop-invites/accept — accepte une invitation (compte connecté). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, "Jeton d'invitation manquant.");

  const result = await acceptInvite(parsed.data.token, user.id);
  if (!result.ok) return fail(400, result.reason);

  await audit({
    action: "shop.member_invited",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: result.shopId,
    metadata: { accepted: true, role: result.role },
  });

  return ok(result);
}
