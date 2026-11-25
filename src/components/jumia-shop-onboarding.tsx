"use client";

import { useCallback, useEffect, useState } from "react";
import { JumiaAccounts } from "@/components/jumia-accounts";
import { JumiaShopLink } from "@/components/jumia-shop-link";
import { OrderSyncPanel } from "@/components/order-sync-panel";
import { roleHasPermission } from "@/lib/roles";
import { KeyRound, Link2, RefreshCw, ShieldCheck, Store } from "lucide-react";

type AttachedShop = { id: string; name: string; currency?: string };

type ShopState = {
  id: string;
  name: string;
  remoteShopId: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

type LocalShop = {
  id: string;
  name: string;
  role: string;
  remoteShopId: string | null;
  remoteShopName: string | null;
};

/**
 * Parcours « Ajouter une boutique Jumia », en trois temps.
 *
 * 1. Le compte vendeur (identifiants Self Authorization) — la vérification
 *    est faite par Jumia côté serveur, les jetons ne quittent jamais le
 *    navigateur.
 * 2. Le choix de la boutique parmi celles que Jumia autorise : l'identifiant
 *    réel vient de Jumia, il n'est jamais saisi ni inventé.
 * 3. La synchronisation initiale des commandes sur une **période choisie**
 *    (Du / Au), avec refus des dates absentes ou inversées, avancement,
 *    erreurs et dernière réussite réelle.
 */
export function JumiaShopOnboarding() {
  const [attached, setAttached] = useState<AttachedShop | null>(null);
  const [shop, setShop] = useState<ShopState | null>(null);
  const [locales, setLocales] = useState<LocalShop[]>([]);
  const [cible, setCible] = useState<string>("");

  const reloadShop = useCallback(async (shopId: string) => {
    try {
      const response = await fetch(`/api/shops/${shopId}`);
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: ShopState;
      } | null;
      if (response.ok && payload?.ok && payload.data) setShop(payload.data);
    } catch {
      // L'écran reste utilisable : la boutique est créée, seul l'état
      // de synchronisation n'est pas encore connu.
    }
  }, []);

  const reloadLocales = useCallback(async () => {
    try {
      const response = await fetch("/api/shops");
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: LocalShop[];
      } | null;
      if (response.ok && payload?.ok) {
        setLocales(payload.data ?? []);
        setCible((prev) => prev || (payload.data?.[0]?.id ?? ""));
      }
    } catch {
      // La liste reste vide : la section affiche un état honnête.
    }
  }, []);

  useEffect(() => {
    if (attached?.id) void reloadShop(attached.id);
  }, [attached, reloadShop]);

  useEffect(() => {
    void reloadLocales();
  }, [reloadLocales]);

  const boutiqueCible = locales.find((row) => row.id === cible) ?? null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="etape-1-2">
        <h2 id="etape-1-2" className="flex items-center gap-2 text-sm font-semibold text-night">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Étapes 1 et 2 — Compte vendeur puis choix de la boutique
        </h2>
        <p className="mt-2 text-sm text-muted">
          Ajoutez votre compte vendeur (Self Authorization), puis choisissez la boutique que Jumia
          vous autorise. L&apos;identifiant de boutique vient de Jumia : il n&apos;est jamais saisi.
        </p>
        <div className="mt-4">
          <JumiaAccounts
            onChanged={() => {
              if (attached?.id) void reloadShop(attached.id);
            }}
            onShopAttached={(shop) => {
              setAttached(shop);
              void reloadShop(shop.id);
            }}
          />
        </div>
      </section>

      {attached ? (
        <section className="card p-5" aria-labelledby="etape-3">
          <h2 id="etape-3" className="flex items-center gap-2 text-sm font-semibold text-night">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Étape 3 — Synchronisation initiale des commandes
          </h2>
          <p className="mt-2 text-sm text-muted">
            La boutique{" "}
            <strong className="text-night">
              {attached.name}
              {shop?.remoteShopId ? (
                <span className="ml-1 text-xs font-normal text-muted">
                  (identifiant Jumia {shop.remoteShopId})
                </span>
              ) : null}
            </strong>{" "}
            est enregistrée. Son catalogue, ses stocks et ses relevés se chargent automatiquement.
            Pour les <strong>commandes</strong>, la lecture est à la main : choisissez la période à
            relire.
          </p>

          <div className="mt-4">
            <OrderSyncPanel
              shopId={attached.id}
              options={[{ id: attached.id, name: attached.name, linked: true }]}
              lastSuccessAt={null}
              lastSyncAt={shop?.lastSyncAt ?? null}
              lastStatus={shop?.lastSyncStatus ?? null}
              onFinished={() => void reloadShop(attached.id)}
            />
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              La lecture porte sur la boutique ci-dessus, jamais sur « la première ». Une lecture
              partielle (limite de pages de l&apos;API atteinte) est annoncée comme partielle : elle
              n&apos;est jamais présentée comme réussie.
            </span>
          </p>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
            <Store className="h-4 w-4" aria-hidden="true" />
            Étape 3 — Synchronisation initiale
          </h2>
          <p className="mt-2 text-sm text-muted">
            Quand la boutique est rattachée, cette section propose la synchronisation de ses
            commandes sur une période que vous choisissez (du / au). Les dates manquantes ou
            inversées sont refusées, et une lecture partielle n&apos;est jamais annoncée comme une
            réussite.
          </p>
        </section>
      )}

      <section className="card p-5" aria-labelledby="rattacher-existante">
        <h2
          id="rattacher-existante"
          className="flex items-center gap-2 text-sm font-semibold text-night"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Rattacher une boutique déjà créée
        </h2>
        <p className="mt-2 text-sm text-muted">
          Si la fiche de la boutique existe déjà (créée sans identifiants), reliez-la à sa boutique
          Jumia : l&apos;identifiant réel vient de la liste Jumia, il n&apos;est jamais saisi.
        </p>
        {locales.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune boutique à rattacher.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Boutique à rattacher
              <select
                value={cible}
                onChange={(event) => setCible(event.target.value)}
                className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
              >
                {locales.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.remoteShopId ? " (déjà rattachée)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {boutiqueCible ? (
              <JumiaShopLink
                shopId={boutiqueCible.id}
                remoteShopId={boutiqueCible.remoteShopId}
                remoteShopName={boutiqueCible.remoteShopName}
                canWrite={roleHasPermission(boutiqueCible.role as never, "shops:write")}
                onChanged={() => {
                  void reloadLocales();
                  void reloadShop(boutiqueCible.id);
                }}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
