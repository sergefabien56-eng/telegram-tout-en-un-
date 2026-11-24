/** Types de `scripts/lib/dump-sql.mjs` (partagé avec l'export en ligne). */

export type DumpClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type BuildSqlDumpOptions = {
  schema?: string;
  stamp?: string;
};

export type SqlDump = {
  sql: string;
  tableCount: number;
  counts: string[];
  stamp: string;
};

export function literal(value: unknown): string;

export function buildSqlDump(client: DumpClient, options?: BuildSqlDumpOptions): Promise<SqlDump>;
