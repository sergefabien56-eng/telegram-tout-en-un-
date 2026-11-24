import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { reportCatalog, reportSales } from "@/lib/reports";

type Params = { params: Promise<{ id: string }> };

const DAY_MS = 86_400_000;

/** Fenêtre demandée : `days` (7, 30, 90) ou dates ISO explicites. */
async function readWindow(url: URL): Promise<{ from: Date; to: Date } | null> {
  const daysRaw = url.searchParams.get("days");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");

  const to = new Date();
  if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    to.setUTCFullYear(
      Number(toRaw.slice(0, 4)),
      Number(toRaw.slice(5, 7)) - 1,
      Number(toRaw.slice(8, 10)),
    );
    to.setUTCHours(23, 59, 59, 999);
  }

  if (fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) {
    const from = new Date(`${fromRaw}T00:00:00Z`);
    return { from, to };
  }

  const days = Number(daysRaw ?? "30");
  if (!Number.isInteger(days) || days < 1 || days > 90) return null;
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

/** GET /api/shops/:id/rapports?days=30 — ventes et catalogue enregistrés. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("reports:read")) {
    return fail(403, "Permission insuffisante pour consulter les rapports.");
  }

  const window = await readWindow(new URL(request.url));
  if (!window)
    return fail(400, "Période invalide : `days` entre 1 et 90, ou `from`/`to` en YYYY-MM-DD.");

  const sales = await reportSales(id, window, {
    statusFilter: ["DELIVERED", "SHIPPED"],
  });
  const catalog = await reportCatalog(id);

  return ok({ sales, catalog });
}
