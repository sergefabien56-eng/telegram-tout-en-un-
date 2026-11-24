/**
 * Génération CSV — export des données réellement enregistrées.
 *
 * Séparateur `;` (Excel francophone) + BOM UTF-8 pour que les accents soient
 * corrects à l'ouverture. Aucune ligne n'est inventée.
 */

export type CsvColumn = {
  key: string;
  label: string;
};

function escape(value: unknown): string {
  // Cellule vide mais toujours entre guillemets : une colonne ne disparaît jamais.
  if (value === null || value === undefined) return '""';
  const text = String(value);
  // Guillemet doublé si présent, puis enveloppement systématique.
  return `"${text.replace(/"/g, '""')}"`;
}

/** Construit un document CSV complet (avec BOM) prêt à être téléchargé. */
export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((column) => escape(column.label)).join(";");
  const body = rows.map((row) => columns.map((column) => escape(row[column.key])).join(";"));
  return `﻿${[header, ...body].join("\r\n")}`;
}
