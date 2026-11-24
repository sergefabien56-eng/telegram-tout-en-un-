import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Les jetons de couleur doivent rester lisibles (WCAG 2.1 AA).
 * On relit `globals.css` : si une couleur est assombrie/éclaircie par erreur,
 * le test échoue au lieu de dégrader silencieusement l'accessibilité.
 */

type Tokens = Record<string, [number, number, number]>;

function parseTriplet(value: string): [number, number, number] | null {
  const match = value.match(/-?\d+(\s+-?\d+){2}/);
  if (!match) return null;
  const parts = match[0].trim().split(/\s+/).map(Number);
  const [r, g, b] = parts as [number, number, number];
  if (parts.length !== 3 || !Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  return [r, g, b];
}

function loadTokens(selector: ":root" | ".dark"): Tokens {
  const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
  const start = css.indexOf(selector === ":root" ? ":root {" : ".dark {");
  expect(start, `${selector} introuvable`).toBeGreaterThan(-1);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end);

  const tokens: Tokens = {};
  for (const line of block.split("\n")) {
    const match = line.match(/--([\w-]+):\s*([^;]+);/);
    if (!match) continue;
    const name = match[1];
    if (!name) continue;
    const triplet = parseTriplet(match[2] ?? "");
    if (triplet) tokens[name] = triplet;
  }
  return tokens;
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  const high = values[0] as number;
  const low = values[1] as number;
  return (high + 0.05) / (low + 0.05);
}

/** Mélange hex + alpha (utilisé par Tailwind : bg-success/10). */
function mix(foreground: [number, number, number], background: [number, number, number], alpha: number) {
  return foreground.map((c, i) => Math.round(c * alpha + (background[i] ?? 0) * (1 - alpha))) as [
    number,
    number,
    number,
  ];
}

const AA = 4.5;

/** Retourne un jeton ou échoue explicitement (évite les `undefined` silencieux). */
function token(tokens: Tokens, name: string): [number, number, number] {
  const value = tokens[name];
  if (!value) throw new Error(`Jeton introuvable : ${name}`);
  return value;
}

describe("contrastes des jetons (WCAG AA)", () => {
  it(" Charge les jetons clairs et sombres", () => {
    expect(loadTokens(":root").card).toEqual([255, 255, 255]);
    expect(loadTokens(".dark").surface).toBeDefined();
  });

  it("texte courant et texte atténué sur carte et surface (clair)", () => {
    const t = loadTokens(":root");
    for (const fg of ["ink", "muted"]) {
      for (const bg of ["card", "surface"]) {
        expect(ratio(token(t, fg), token(t, bg)), `${fg} sur ${bg}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("texte courant et atténué sur carte et surface (sombre)", () => {
    const t = loadTokens(".dark");
    for (const fg of ["ink", "muted"]) {
      for (const bg of ["card", "surface"]) {
        expect(ratio(token(t, fg), token(t, bg)), `${fg} sur ${bg}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("liens et libellés primaires sur les fonds (clair et sombre)", () => {
    for (const selector of [":root", ".dark"] as const) {
      const t = loadTokens(selector);
      expect(ratio(token(t, "primary-ink"), token(t, "surface")), `primary-ink sur surface (${selector})`).toBeGreaterThanOrEqual(AA);
      expect(ratio(token(t, "primary-ink"), token(t, "card")), `primary-ink sur card (${selector})`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("texte blanc des boutons sur le primaire (clair et sombre)", () => {
    for (const selector of [":root", ".dark"] as const) {
      const t = loadTokens(selector);
      expect(
        ratio([255, 255, 255], token(t, "primary")),
        `blanc sur primary (${selector})`,
      ).toBeGreaterThanOrEqual(AA);
      expect(
        ratio([255, 255, 255], token(t, "primary-hover")),
        `blanc sur primary-hover (${selector})`,
      ).toBeGreaterThanOrEqual(AA);
    }
  });

  it("messages de statut sur fond teinté 10 % (clair et sombre)", () => {
    for (const selector of [":root", ".dark"] as const) {
      const t = loadTokens(selector);
      for (const tone of ["success", "danger"] as const) {
        const tint = mix(token(t, tone), token(t, "card"), 0.1);
        expect(ratio(token(t, tone), tint), `${tone} sur ${tone}/10% (${selector})`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("pastilles neutres lisibles dans les deux thèmes", () => {
    for (const selector of [":root", ".dark"] as const) {
      const t = loadTokens(selector);
      // .badge-neutral : texte muted sur fond surface
      expect(ratio(token(t, "muted"), token(t, "surface")), `badge-neutral (${selector})`).toBeGreaterThanOrEqual(AA);
    }
  });
});
