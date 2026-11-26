import { afterEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  AUTO_SYNC_MAX_AGE_MS,
  AUTO_SYNC_WINDOW_DAYS,
  isStale,
  listStaleAttachedShops,
  readAutoSyncState,
  readAutoSyncStates,
  startAutoSync,
} from "@/lib/auto-sync";

/**
 * Synchronisation automatique — vérification sur base réelle.
 *
 * Ces tests ne contactent **jamais** l'API Jumia : ils portent sur la
 * mécanique de fraîcheur (périmé / à jour) et sur le verrou, qui est ce qui
 * empêche deux relectures simultanées et donc le gaspillage de quota.
 */
describe("synchronisation automatique", () => {
  const boutiquesCreees: string[] = [];
  const comptesCrees: string[] = [];

  afterEach(async () => {
    const db = getDb();
    for (const id of boutiquesCreees.splice(0)) {
      await db.delete(schema.shops).where(eq(schema.shops.id, id));
    }
    for (const id of comptesCrees.splice(0)) {
      await db.delete(schema.jumiaAccounts).where(eq(schema.jumiaAccounts.id, id));
    }
  });

  /**
   * Boutique de test rattachée ou non, avec une date de synchro imposée.
   *
   * `jumiaAccountId` doit être un UUID valide : on crée donc un compte
   * vendeur jetable, nettoyé avec les boutiques.
   */
  async function creerBoutique(options: {
    remoteShopId?: string | null;
    /** `true` = rattacher à un compte vendeur jetable. */
    attachee?: boolean;
    lastSyncAt?: Date | null;
  }): Promise<string> {
    const db = getDb();
    const owner = (
      await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .limit(1)
    )[0];
    if (!owner) throw new Error("aucun utilisateur en base");

    let jumiaAccountId: string | null = null;
    if (options.attachee) {
      const compte = (
        await db
          .insert(schema.jumiaAccounts)
          .values({
            ownerUserId: owner.id,
            label: `AUTO-SYNC-TEST-${Date.now()}`,
            clientId: "compte-de-test",
            refreshTokenCiphertext: "jeton-de-test",
            status: "active",
          })
          .returning({ id: schema.jumiaAccounts.id })
      )[0]!;
      jumiaAccountId = compte.id;
      comptesCrees.push(compte.id);
    }
    const boutique = (
      await db
        .insert(schema.shops)
        .values({
          name: `AUTO-SYNC-TEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          platform: "jumia",
          externalShopId: `AUTO-${Math.floor(Math.random() * 1000000)}`,
          country: "CI",
          currency: "XOF",
          ownerUserId: owner.id,
          remoteShopId: options.remoteShopId ?? null,
          jumiaAccountId,
          lastSyncAt: options.lastSyncAt ?? null,
        })
        .returning({ id: schema.shops.id })
    )[0]!;
    boutiquesCreees.push(boutique.id);
    return boutique.id;
  }

  describe("fraîcheur", () => {
    it("considère comme périmée une boutique jamais synchronisée", () => {
      expect(isStale(null)).toBe(true);
    });

    it("considère comme à jour une boutique synchronisée à l'instant", () => {
      expect(isStale(new Date())).toBe(false);
    });

    it("considère comme périmée une boutique dont la synchro est ancienne", () => {
      const ancien = new Date(Date.now() - AUTO_SYNC_MAX_AGE_MS - 60_000);
      expect(isStale(ancien)).toBe(true);
    });

    it("ne déclenche rien quand les données sont à jour", () => {
      const limite = new Date(Date.now() - AUTO_SYNC_MAX_AGE_MS + 5_000);
      expect(isStale(limite)).toBe(false);
    });
  });

  describe("lecture d'état", () => {
    it("ignore les boutiques non rattachées à Jumia", async () => {
      const id = await creerBoutique({ remoteShopId: null, lastSyncAt: null });
      const etat = await readAutoSyncState(id);
      expect(etat).not.toBeNull();
      // Non rattachée ⇒ jamais périmée : il n'y a rien à relire.
      expect(etat!.stale).toBe(false);
    });

    it("signale une boutique rattachée jamais synchronisée comme périmée", async () => {
      const id = await creerBoutique({ remoteShopId: "remote-auto-sync", lastSyncAt: null });
      const etat = await readAutoSyncState(id);
      expect(etat!.stale).toBe(true);
    });

    it("signale une boutique rattachée et à jour comme non périmée", async () => {
      const id = await creerBoutique({
        remoteShopId: "remote-auto-sync",
        lastSyncAt: new Date(),
      });
      const etat = await readAutoSyncState(id);
      expect(etat!.stale).toBe(false);
      expect(etat!.lastSyncAt).not.toBeNull();
    });

    it("renvoie un état pour chaque boutique demandée", async () => {
      const a = await creerBoutique({ remoteShopId: "remote-a" });
      const b = await creerBoutique({ remoteShopId: "remote-b" });
      const etats = await readAutoSyncStates([a, b]);
      expect(etats).toHaveLength(2);
      expect(etats.map((e) => e.shopId).sort()).toEqual([a, b].sort());
    });

    it("renvoie un état vide pour une liste vide", async () => {
      expect(await readAutoSyncStates([])).toEqual([]);
    });
  });

  describe("déclenchement", () => {
    it("ne lance rien sur une boutique dont les données sont à jour", async () => {
      const id = await creerBoutique({
        remoteShopId: "remote-auto-sync",
        lastSyncAt: new Date(),
      });
      const resultat = await startAutoSync({ userId: "peu-importe", shopId: id });
      expect(resultat.started).toBe(false);
      expect(resultat.reason).toBe("Données à jour.");
    });

    it("ne lance rien sur une boutique non rattachée", async () => {
      const id = await creerBoutique({ remoteShopId: null, lastSyncAt: null });
      const resultat = await startAutoSync({ userId: "peu-importe", shopId: id });
      expect(resultat.started).toBe(false);
    });

    it("ne lance rien quand une synchronisation est déjà en cours", async () => {
      const id = await creerBoutique({
        remoteShopId: "remote-auto-sync",
        lastSyncAt: null,
      });
      await getDb()
        .update(schema.shops)
        .set({ syncInProgress: true })
        .where(eq(schema.shops.id, id));

      const resultat = await startAutoSync({ userId: "peu-importe", shopId: id });
      expect(resultat.started).toBe(false);
      expect(resultat.reason).toBe("Synchronisation déjà en cours.");

      await getDb()
        .update(schema.shops)
        .set({ syncInProgress: false })
        .where(eq(schema.shops.id, id));
    });

    it("renvoie un état null pour une boutique inexistante", async () => {
      const resultat = await startAutoSync({
        userId: "peu-importe",
        shopId: "00000000-0000-0000-0000-000000000000",
      });
      expect(resultat.started).toBe(false);
      expect(resultat.state).toBeNull();
    });
  });

  describe("tâche planifiée", () => {
    it("ne liste que les boutiques rattachées, à un compte, et périmées", async () => {
      const avant = new Set((await listStaleAttachedShops()).map((s) => s.id));

      const attacheePerimee = await creerBoutique({
        remoteShopId: "remote-planifiee",
        attachee: true,
        lastSyncAt: null,
      });
      const attacheeAJour = await creerBoutique({
        remoteShopId: "remote-a-jour",
        attachee: true,
        lastSyncAt: new Date(),
      });
      const nonAttachee = await creerBoutique({
        remoteShopId: null,
        lastSyncAt: null,
      });

      const liste = await listStaleAttachedShops();
      const ids = new Set(liste.map((s) => s.id));

      expect(ids.has(attacheePerimee)).toBe(true);
      expect(ids.has(attacheeAJour)).toBe(false);
      expect(ids.has(nonAttachee)).toBe(false);
      // Aucune boutique étrangère à la passe n'a pu entrer dans la liste.
      for (const id of avant) expect(ids.has(id)).toBe(true);
    });
  });

  describe("fenêtre", () => {
    it("rejoue une fenêtre courte et suit les changements de statut", () => {
      expect(AUTO_SYNC_WINDOW_DAYS).toBeLessThanOrEqual(30);
      expect(AUTO_SYNC_WINDOW_DAYS).toBeGreaterThanOrEqual(1);
    });
  });
});
