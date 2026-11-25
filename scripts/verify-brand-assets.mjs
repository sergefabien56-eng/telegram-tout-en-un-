/**
 * Contrôle de fidélité de la marque : compare le rendu de `src/app/icon.svg`
 * au fichier officiel communiqué par le commanditaire et publie la preuve
 * visuelle dans `docs/captures`.
 *
 * Le fichier source n'est pas versionné (dossier `uploads/` ignoré par Git) :
 * sans lui, le contrôle se termine proprement sans rien produire.
 *
 * Usage : node scripts/verify-brand-assets.mjs
 */
import { existsSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "uploads/5nfKNrrsw04vcXxEaMjPvL6IDYyGgb9wDRLnUmi2-9M.webp";
const ICON = "src/app/icon.svg";
const PREVIEW = "docs/captures/29-logo-source-et-rendu.png";
const SIZE = 1024;

if (!existsSync(SOURCE)) {
  console.log(`Source officielle absente (${SOURCE}) : contrôle de fidélité ignoré.`);
  process.exit(0);
}

const source = await sharp(SOURCE)
  .resize(SIZE, SIZE, { fit: "fill" })
  .flatten({ background: "#fff" })
  .raw()
  .toBuffer();

const rendered = await sharp(ICON)
  .resize(SIZE, SIZE, { fit: "fill" })
  .flatten({ background: "#fff" })
  .raw()
  .toBuffer();

if (source.length !== rendered.length) {
  console.error("Dimensions inattendues entre la source et le rendu.");
  process.exit(1);
}

let sum = 0;
for (let i = 0; i < source.length; i += 1) sum += Math.abs(source[i] - rendered[i]);
const mae = sum / source.length;

const sourcePng = await sharp(source, { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png()
  .toBuffer();
const renderedPng = await sharp(rendered, { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: SIZE * 2 + 20, height: SIZE, channels: 3, background: "#888888" },
})
  .composite([
    { input: sourcePng, left: 0, top: 0 },
    { input: renderedPng, left: SIZE + 20, top: 0 },
  ])
  .png()
  .toFile(PREVIEW);

console.log(
  `Écart absolu moyen : ${mae.toFixed(3)}/255 par canal (${((mae / 255) * 100).toFixed(2)} %).`,
);
console.log(`Comparaison : ${PREVIEW}`);

if (mae > 1) {
  console.error("Fidélité insuffisante : l'icône s'écarte de la source officielle.");
  process.exit(1);
}
