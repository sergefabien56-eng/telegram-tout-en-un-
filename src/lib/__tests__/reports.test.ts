import { describe, expect, it } from "vitest";

import { daysOf } from "@/lib/reports";

/** La découpe en jours est le cœur du rapport : on la teste sans base. */

describe("découpage de la fenêtre de rapport", () => {
  it("couvre chaque jour, bornes incluses, en UTC", () => {
    expect(
      daysOf({ from: new Date("2026-11-20T00:00:00Z"), to: new Date("2026-11-24T23:59:59Z") }),
    ).toEqual(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
  });

  it("traverse un mois sans sauter de jour", () => {
    const days = daysOf({
      from: new Date("2026-11-28T00:00:00Z"),
      to: new Date("2026-12-02T00:00:00Z"),
    });
    expect(days).toHaveLength(5);
    expect(days.at(-1)).toBe("2026-12-02");
  });
});
