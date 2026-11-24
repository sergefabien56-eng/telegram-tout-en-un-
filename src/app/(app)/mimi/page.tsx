import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listMessages, listConversations } from "@/lib/mimi";
import { MimiChat } from "@/components/mimi-chat";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** MIMI — assistante qui ne cite que des agrégats réels. */
export default async function MimiPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const { shop } = await getCurrentShop(user.id);

  const access = shop ? await getShopAccess(user.id, shop.id) : null;
  if (shop && !access?.permissions.has("mimi:use")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">MIMI</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas d&apos;utiliser MIMI.
        </p>
      </div>
    );
  }

  const conversations = await listConversations(user.id);
  const activeId = query.conversation ?? conversations[0]?.id ?? null;
  const messages = activeId ? await listMessages(activeId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">MIMI</h1>
        <p className="mt-1 text-sm text-muted">
          Assistante de boutique. Elle ne répond qu&apos;avec les données réellement enregistrées :
          commandes, stocks et relevés Jumia de{" "}
          <span className="font-medium text-night">{shop?.name ?? "votre boutique"}</span>.
        </p>
      </div>

      <div className="card p-5">
        <ul className="grid gap-2 text-xs text-muted sm:grid-cols-3">
          <li>· Source indiquée pour chaque chiffre</li>
          <li>· « donnée indisponible » si l&apos;outil ne répond pas</li>
          <li>· Aucune modification de prix ni de stock</li>
        </ul>
      </div>

      <MimiChat
        shopId={shop?.id ?? null}
        initialConversationId={activeId}
        initialMessages={messages.map((row) => ({
          id: row.id,
          role: row.role,
          content: row.content,
          toolName: row.toolName,
        }))}
      />
    </div>
  );
}
