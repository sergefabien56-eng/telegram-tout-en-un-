/**
 * Génère les artefacts de marque « Tout en Un » à partir d'une géométrie
 * canonique unique :
 *   - src/lib/brand-logo.json  (source de vérité partagée)
 *   - src/app/icon.svg         (icône applicative / favicon)
 *
 * La géométrie provient des mesures sous-pixel du fichier officiel communiqué
 * par le commanditaire (WebP 1024 × 1024) puis affinée par descente
 * descendante sur ce raster. Le rendu de `src/app/icon.svg` a été vérifié à
 * ~0,7/255 d'écart absolu moyen (≈ 0,3 %) face à la source.
 *
 * Usage : node scripts/generate-brand-assets.mjs
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";

/** Géométrie canonique, exprimée dans le repère 1024 × 1024 de la source. */
export const GEOMETRY = {
  viewBox: "0 0 1024 1024",
  colors: {
    navy: "#0d1a38",
    light: "#ecf2f9",
    teal: "#22bdc4",
  },
  /** Pavé de fond : carré plein à coins arrondis. */
  tile: { width: 1024, height: 1024, radius: 91.67 },
  /** Quatre carrés clairs, un par coin. */
  squares: {
    width: 141.4,
    height: 139.09,
    x: [195.9, 686.9],
    y: [196.48, 676.49],
  },
  /** Carré teal central. */
  center: { x: 428.8, y: 422.95, width: 166.38, height: 159.9 },
  /** Bras diagonaux reliant chaque carré clair au carré teal central. */
  arms: { width: 17.98, start: 7.13, end: 11.5 },
};

const round = (value) => Math.round(value * 1000) / 1000;

/** Liste ordonnée des quatre carrés clairs : haut-gauche, haut-droit, bas-gauche, bas-droit. */
export function squaresOf(geometry) {
  const { x, y, width, height } = geometry.squares;
  return [
    { x: x[0], y: y[0], width, height },
    { x: x[1], y: y[0], width, height },
    { x: x[0], y: y[1], width, height },
    { x: x[1], y: y[1], width, height },
  ];
}

/**
 * Bras diagonaux : de chaque coin intérieur d'un carré clair vers le coin
 * correspondant du carré teal, prolongés sous les carrés pour que les
 * raccords ne laissent aucune couture.
 */
export function computeArms(geometry) {
  const squares = squaresOf(geometry);
  const center = geometry.center;
  return squares.map((square, index) => {
    const right = index % 2 === 1;
    const bottom = index < 2;
    const from = {
      x: right ? square.x : square.x + square.width,
      y: bottom ? square.y + square.height : square.y,
    };
    const to = {
      x: right ? center.x + center.width : center.x,
      y: bottom ? center.y : center.y + center.height,
    };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    return {
      x1: round(from.x - ux * geometry.arms.start),
      y1: round(from.y - uy * geometry.arms.start),
      x2: round(to.x + ux * geometry.arms.end),
      y2: round(to.y + uy * geometry.arms.end),
    };
  });
}

/** Contenu SVG commun (pavé, bras, carrés clairs, carré central). */
export function buildIcon(geometry) {
  const arms = computeArms(geometry);
  const lines = arms
    .map(
      (line) =>
        `    <line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${geometry.colors.teal}" stroke-width="${geometry.arms.width}"/>`,
    )
    .join("\n");
  const squares = squaresOf(geometry)
    .map(
      (square) =>
        `    <rect x="${square.x}" y="${square.y}" width="${square.width}" height="${square.height}" fill="${geometry.colors.light}"/>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${geometry.viewBox}">
  <rect width="${geometry.tile.width}" height="${geometry.tile.height}" rx="${geometry.tile.radius}" fill="${geometry.colors.navy}"/>
  <g fill="none" stroke-linecap="butt">
${lines}
  </g>
  <g>
${squares}
  </g>
  <rect x="${geometry.center.x}" y="${geometry.center.y}" width="${geometry.center.width}" height="${geometry.center.height}" fill="${geometry.colors.teal}"/>
</svg>
`;
}

/** Écrit les artefacts de marque sur disque. */
export async function writeAssets(geometry = GEOMETRY) {
  const arms = computeArms(geometry);
  const payload = { ...geometry, arms: { ...geometry.arms, lines: arms } };

  // Le JSON est formaté avec la configuration Prettier du dépôt : le fichier
  // généré reste identique à ce que `npm run format:check` attend.
  const jsonPath = new URL("../src/lib/brand-logo.json", import.meta.url);
  const options = await resolveConfig(jsonPath.pathname);
  const json = await format(`${JSON.stringify(payload)}\n`, {
    ...options,
    parser: "json",
    plugins: [],
  });
  writeFileSync(jsonPath, json);

  writeFileSync(new URL("../src/app/icon.svg", import.meta.url), buildIcon(geometry));
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeAssets();
  console.log("src/lib/brand-logo.json et src/app/icon.svg écrits");
}
