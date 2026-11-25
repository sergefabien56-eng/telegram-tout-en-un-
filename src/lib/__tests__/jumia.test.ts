import { afterEach, describe, expect, it, vi } from "vitest";
import { describeOAuthError, JumiaError, getAccessToken } from "@/lib/jumia/client";
import { listRemoteShopsFromBody } from "@/lib/jumia/shops";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.JUMIA_CLIENT_ID;
  delete process.env.JUMIA_REFRESH_TOKEN;
});

describe("describeOAuthError", () => {
  it("explique un refresh token expiré", () => {
    expect(describeOAuthError("invalid_grant")).toContain("Générez-en un nouveau");
  });

  it("explique un mauvais type d'application", () => {
    expect(describeOAuthError("unauthorized_client")).toContain("Self Authorization");
  });

  it("retombe sur la description fournie", () => {
    expect(describeOAuthError(null, "Quota dépassé")).toBe("Quota dépassé");
  });
});

/**
 * Ce test ne doit PAS toucher une base réelle : localement et en intégration,
 * `DATABASE_URL` pointe sur la base de production où les identifiants Jumia sont
 * stockés. On le réserve donc à un environnement sans base (CI).
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(hasDb)("getAccessToken sans identifiants", () => {
  it("refuse proprement quand rien n'est configuré", async () => {
    await expect(getAccessToken()).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("réponse OAuth en erreur", () => {
  it("traduit invalid_grant sans rien écrire", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant", error_description: "expiré" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const { exchangeAccessToken } = await import("@/lib/jumia/client");
    await expect(exchangeAccessToken({ clientId: "c", refreshToken: "r" })).rejects.toBeInstanceOf(
      JumiaError,
    );
  });
});

describe("normalisation GET /shops", () => {
  it("lit le tableau brut et conserve les pays", () => {
    const shops = listRemoteShopsFromBody([
      {
        id: "abc",
        name: "NKSF Shop",
        email: "shop@example.com",
        businessClients: [{ countryCode: "CI", name: "Jumia", status: "ACTIVE" }],
      },
    ]);
    expect(shops).toEqual([
      {
        id: "abc",
        name: "NKSF Shop",
        email: "shop@example.com",
        countries: [{ code: "CI", name: "Jumia", status: "ACTIVE" }],
        // Le code du client commercial n'est pas fourni : il reste vide
        // plutôt que d'être inventé.
        businessClients: [],
      },
    ]);
  });

  it("conserve le code du client commercial, qui porte le prix local", () => {
    const shops = listRemoteShopsFromBody([
      {
        id: "abc",
        name: "NKSF Shop",
        businessClients: [
          { code: "jumia-ci", name: "Jumia Côte d'Ivoire", countryCode: "CI", status: "ACTIVE" },
        ],
      },
    ]);
    expect(shops[0]?.businessClients).toEqual([
      { code: "jumia-ci", name: "Jumia Côte d'Ivoire", countryCode: "CI" },
    ]);
  });

  it("ignore les entrées incomplètes sans échouer", () => {
    const shops = listRemoteShopsFromBody([{ id: "abc" }, { name: "sans id" }, 42]);
    expect(shops).toEqual([]);
  });

  it("accepte la forme { shops: [] } en secours", () => {
    const shops = listRemoteShopsFromBody({ shops: [{ id: "x", name: "X" }] });
    expect(shops).toHaveLength(1);
  });
});
