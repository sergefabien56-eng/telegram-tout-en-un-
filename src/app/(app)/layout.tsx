import { AppShell, type ShellShop } from "@/components/app-shell";
import { MiniAppShell } from "@/components/mini-app-shell";
import { TelegramThemeSync } from "@/components/telegram-theme-sync";
import { UI_COOKIE } from "@/lib/cookies";
import { listUserShops } from "@/lib/shops";
import { SHOP_COOKIE } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { isRole, ROLE_PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * Layout de l'espace connecté : sidebar + topbar (web) ou coquille basse
 * Mini App (Telegram), sur toutes les pages du groupe `(app)`.
 * Les permissions sont calculées côté serveur, une seule fois.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const shops = await listUserShops(user.id);

  // Boutique courante choisie par le vendeur (cookie `teu_shop`). Elle doit
  // piloter l'affichage : l'en-tête et les pages show the same boutique.
  const cookieShopId = (await cookies()).get(SHOP_COOKIE)?.value ?? null;
  const currentShopId =
    shops.find((shop) => shop.id === cookieShopId)?.id ?? shops[0]?.id ?? null;

  // Union des permissions sur toutes les boutiques de l'utilisateur.
  const permissions = new Set<string>();
  for (const shop of shops) {
    if (isRole(shop.role)) {
      for (const permission of ROLE_PERMISSIONS[shop.role]) {
        permissions.add(permission);
      }
    }
  }
  // Un propriétaire de boutique a toutes les permissions de son espace.
  if (shops.some((shop) => shop.role === "owner")) permissions.add("*");

  const shellShops: ShellShop[] = shops.map((shop) => ({
    id: shop.id,
    name: shop.name,
    role: shop.role,
  }));

  // Le cookie `teu_ui=mini` est posé lors de l'échange initData → session.
  const ui = (await cookies()).get(UI_COOKIE)?.value;
  const mini = ui === "mini";

  if (mini) {
    return (
      <TelegramThemeSync>
        <MiniAppShell
          user={{ fullName: user.fullName, email: user.email }}
          shops={shellShops}
          permissions={[...permissions]}
          currentShopId={currentShopId}
        >
          {children}
        </MiniAppShell>
      </TelegramThemeSync>
    );
  }

  return (
    <AppShell
      user={{ fullName: user.fullName, email: user.email }}
      shops={shellShops}
      permissions={[...permissions]}
      currentShopId={currentShopId}
    >
      {children}
    </AppShell>
  );
}
