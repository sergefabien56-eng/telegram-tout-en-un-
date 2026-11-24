import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, minorUnits, parseMoneyToMinor } from "@/lib/money";

const norm = (s: string) => s.replace(/[\u202f\u00a0]/g, " ").trim();

describe("money", () => {
  it("XOF n'a pas de décime", () => {
    expect(minorUnits("XOF")).toBe(0);
    expect(minorUnits("EUR")).toBe(2);
  });

  it("formate des FCFA entiers", () => {
    expect(norm(formatMoney(123456, "XOF"))).toBe("123 456 FCFA");
  });

  it("formate des euros avec centimes", () => {
    expect(norm(formatMoney(123456, "EUR"))).toBe("1 234,56 €");
  });

  it("affiche — pour une valeur non finie", () => {
    expect(formatMoney(Number.NaN, "XOF")).toBe("—");
  });

  it("parse une saisie FCFA", () => {
    expect(parseMoneyToMinor("15 000", "XOF")).toBe(15000);
    expect(parseMoneyToMinor("15000", "XOF")).toBe(15000);
  });

  it("parse une saisie EUR", () => {
    expect(parseMoneyToMinor("1 234,56", "EUR")).toBe(123456);
  });

  it("refuse une saisie invalide", () => {
    expect(parseMoneyToMinor("abc", "XOF")).toBeNull();
    expect(parseMoneyToMinor("", "XOF")).toBeNull();
  });

  it("additionne uniquement la même devise", () => {
    expect(
      addMoney([
        { amountMinor: 100, currency: "XOF" },
        { amountMinor: 250, currency: "XOF" },
      ]),
    ).toEqual({ amountMinor: 350, currency: "XOF" });
  });

  it("refuse d'additionner deux devises différentes", () => {
    expect(() =>
      addMoney([
        { amountMinor: 100, currency: "XOF" },
        { amountMinor: 100, currency: "EUR" },
      ]),
    ).toThrow(/devises différentes/);
  });

  it("refuse une liste vide", () => {
    expect(() => addMoney([])).toThrow(/liste vide/);
  });
});
