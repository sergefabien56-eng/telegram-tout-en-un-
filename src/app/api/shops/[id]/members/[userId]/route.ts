import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { changeMemberRole, removeMember } from "@/lib/shops";
import { changeRoleSchema, formatZodErrors } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; userId: string }> };

/** PATCH — change le rôle d'un membre. */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id, userId } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("members:write")) return fail(403, "Permission insuffisante.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = changeRoleSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));

  const result = await changeMemberRole(user.id, id, userId, parsed.data.role);
  if (!result.ok) return fail(400, result.reason);

  await audit({
    action: "shop.member_role_changed",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
    metadata: { targetUserId: userId, role: parsed.data.role },
  });
  return ok({ role: parsed.data.role });
}

/** DELETE — retire un membre. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id, userId } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("members:write")) return fail(403, "Permission insuffisante.");

  const result = await removeMember(user.id, id, userId);
  if (!result.ok) return fail(400, result.reason);

  await audit({
    action: "shop.member_removed",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
    metadata: { targetUserId: userId },
  });
  return ok({ removed: true });
}
