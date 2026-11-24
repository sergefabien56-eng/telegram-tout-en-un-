import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { inviteMember, listMembers } from "@/lib/shops";
import { formatZodErrors, inviteMemberSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/members — liste (permission members:read). */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("members:read")) return fail(403, "Permission insuffisante.");

  return ok(await listMembers(id));
}

/** POST /api/shops/:id/members — invite un membre (permission members:write). */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("members:write"))
    return fail(403, "Permission insuffisante (members:write).");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));

  const result = await inviteMember(user.id, id, parsed.data.email, parsed.data.role);
  if (!result.ok) return fail(400, result.reason);

  await audit({
    action: "shop.member_invited",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  return ok(result, { status: 201 });
}
