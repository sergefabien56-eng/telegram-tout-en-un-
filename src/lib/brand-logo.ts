import brandLogo from "./brand-logo.json";

/**
 * Marque « Tout en Un » — géométrie et couleurs du logo officiel.
 *
 * Le fichier `brand-logo.json` est la source de vérité partagée entre
 * l'icône applicative (`src/app/icon.svg`) et le composant React
 * (`src/components/brand-mark.tsx`). Il est produit par
 * `scripts/generate-brand-assets.mjs`, à partir des mesures sous-pixel du
 * fichier officiel communiqué par le commanditaire.
 *
 * Le rendu généré a été vérifié face à la source à 0,69/255 d'écart absolu
 * moyen (≈ 0,27 %) par canal.
 *
 * Couleurs (mesurées sur la source) :
 *   navy  #0d1a38 — fond du pavé
 *   light #ecf2f9 — carrés clairs
 *   teal  #22bdc4 — carré central et bras diagonaux
 */

export type BrandLogoColor = "navy" | "light" | "teal";

export type BrandLogoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrandLogoLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type BrandLogoGeometry = {
  viewBox: string;
  colors: Record<BrandLogoColor, string>;
  tile: { width: number; height: number; radius: number };
  squares: { width: number; height: number; x: number[]; y: number[] };
  center: BrandLogoRect;
  arms: { width: number; start: number; end: number; lines: BrandLogoLine[] };
};

export const BRAND_LOGO = brandLogo as BrandLogoGeometry;

/** Les quatre carrés clairs, en haut-gauche, haut-droit, bas-gauche, bas-droit. */
export const BRAND_LOGO_SQUARES: BrandLogoRect[] = (() => {
  const { squares } = BRAND_LOGO;
  const xs = squares.x;
  const ys = squares.y;
  const left = xs[0] ?? 0;
  const right = xs[1] ?? left;
  const top = ys[0] ?? 0;
  const bottom = ys[1] ?? top;
  return [
    { x: left, y: top, width: squares.width, height: squares.height },
    { x: right, y: top, width: squares.width, height: squares.height },
    { x: left, y: bottom, width: squares.width, height: squares.height },
    { x: right, y: bottom, width: squares.width, height: squares.height },
  ];
})();
