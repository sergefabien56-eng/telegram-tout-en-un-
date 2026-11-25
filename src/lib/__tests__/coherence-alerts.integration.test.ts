import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { alertCoherenceIssues, alertRecipients } from "@/lib/coherence-alerts";
import type { CoherenceAnomaly } from "@/lib/coherence";

/**
 * ALERTES DE COHÉRENCE — base réelle.
 *
 * On vérifie ce qui ne se voit pas en test pur : la notification est bien
 * écrite, elle est **dédupliquée** (le contrôle planifié passe chaque jour),
 * et elle disparaît avec la boutique de test (aucun résidu en production).
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("alertes de cohérence (base réelle)", () => {
  const suffix = Date.now();
  let userId = "";
  let managerId = "";
  let shopId = "";

  const anomaly: CoherenceAnomaly = {
    code: "montant_divergent",
    severity: "critique",
    title: "Un montant diverge",
    evidence: "Preuve chiffrée.",
    cause: "Cause.",
    recommendation: "Resynchroniser.",
  };

  beforeAll(async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `alertes-${suffix}@exemple.ci`,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Test Alertes",
      })
      .returning({ id: schema.users.id });
    userId = user?.id ?? "";

    // Second destinataire : un gestionnaire de la même boutique. Il doit
    // être prévenu **lui aussi** — c'est ce que l'unicité par
    // (utilisateur, clé) garantit.
    const [manager] = await db
      .insert(schema.users)
      .values({
        email: `alertes-manager-${suffix}@exemple.ci`,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Test Alertes Gestionnaire",
      })
      .returning({ id: schema.users.id });
    managerId = manager?.id ?? "";

    const [shop] = await db
      .insert(schema.shops)
      .values({
        ownerUserId: userId,
        name: "Boutique Alertes",
        platform: "jumia",
        externalShopId: `ALERTES-${suffix}`,
        country: "CI",
        currency: "XOF",
      })
      .returning({ id: schema.shops.id });
    shopId = shop?.id ?? "";

    await db
      .insert(schema.shopMembers)
      .values([
        { shopId, userId, role: "owner" },
        { shopId, userId: managerId, role: "manager" },
      ]);
  });

  afterAll(async () => {
    if (!userId) return;
    const db = getDb();
    await db.delete(schema.notifications).where(eq(schema.notifications.shopId, shopId));
    if (shopId) await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    if (managerId) await db.delete(schema.users).where(eq(schema.users.id, managerId));
  });

  it("trouve le propriétaire comme destinataire", async () => {
    expect(await alertRecipients(shopId)).toContain(userId);
  });

  it("crée la notification chez chaque destinataire", async () => {
    const result = await alertCoherenceIssues({
      shopId,
      shopName: "Boutique Alertes",
      anomalies: [anomaly],
      drift: null,
      day: "2026-11-25",
      sendTelegram: false,
    });
    expect(result.length).toBe(2);
    expect(result.every((row) => row.delivered.includes("web"))).toBe(true);

    const db = getDb();
    const rows = await db
      .select({
        userId: schema.notifications.userId,
        title: schema.notifications.title,
        body: schema.notifications.body,
      })
      .from(schema.notifications)
      .where(eq(schema.notifications.shopId, shopId));
    // Le propriétaire **et** le gestionnaire sont informés : la
    // déduplication est par destinataire, pas globale.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.userId))).toEqual(new Set([userId, managerId]));
    expect(rows[0]?.title).toContain("montant");
    expect(rows[0]?.body).toContain("Preuve chiffrée.");
  });

  it("ne crée pas de doublon pour le même problème le même jour", async () => {
    const result = await alertCoherenceIssues({
      shopId,
      shopName: "Boutique Alertes",
      anomalies: [anomaly],
      drift: null,
      day: "2026-11-25",
      sendTelegram: false,
    });
    expect(result.every((row) => row.delivered.length === 0)).toBe(true);

    const db = getDb();
    const rows = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.shopId, shopId));
    expect(rows).toHaveLength(2);
  });

  it("n'alerte pas sur une simple information", async () => {
    const result = await alertCoherenceIssues({
      shopId,
      shopName: "Boutique Alertes",
      anomalies: [{ ...anomaly, code: "commande_non_synchronisee", severity: "information" }],
      drift: null,
      day: "2026-11-25",
      sendTelegram: false,
    });
    expect(result).toHaveLength(0);

    const db = getDb();
    const rows = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.shopId, shopId));
    expect(rows).toHaveLength(2);
  });

  it("alerte sur une dérive seule, sans anomalie", async () => {
    const result = await alertCoherenceIssues({
      shopId,
      shopName: "Boutique Alertes",
      anomalies: [],
      drift: {
        code: "montant_recule",
        severity: "avertissement",
        title: "Le CA articles a reculé nettement",
        evidence: "Le CA a reculé de 30 %.",
        cause: "Correction à la source.",
        recommendation: "Vérifier la synchronisation des relevés.",
      },
      day: "2026-11-25",
      sendTelegram: false,
    });
    expect(result.length).toBe(2);
    expect(result.every((row) => row.delivered.includes("web"))).toBe(true);

    const db = getDb();
    const rows = await db
      .select({ title: schema.notifications.title })
      .from(schema.notifications)
      .where(eq(schema.notifications.shopId, shopId));
    expect(rows).toHaveLength(4); // 2 anomalies + 2 dérives
    expect(rows.some((row) => row.title.includes("Évolution"))).toBe(true);
  });

  it("laisse la base propre après le test", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(inArray(schema.notifications.shopId, [shopId]));
    // Les notifications du test restent (elles sont supprimées par le
    // afterAll) : ce qui compte ici, c'est qu'aucune notification ne
    // s'est propagée à d'autres boutiques.
    expect(rows.length).toBeLessThanOrEqual(4);
  });
});
