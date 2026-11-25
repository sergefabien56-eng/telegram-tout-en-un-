import { jumiaGet } from "./request";

export type PayoutStatement = {
  statementNumber?: string;
  shopSid?: string;
  createdAt?: string;
  updatedAt?: string | null;
  openingBalance?: number;
  itemRevenue?: number;
  shipmentFee?: number;
  shipmentFeeCredit?: number;
  otherRevenueTotal?: number;
  feesTotal?: number;
  subtotal1?: number;
  refunds?: number;
  feesOnRefundsTotal?: number;
  subtotal2?: number;
  closingBalance?: number;
  guaranteeDeposit?: number;
  payoutAmount?: number;
  payoutCurrency?: string;
  paid?: boolean;
  paymentReference?: string | null;
  subsidy?: number;
  subsidyRefund?: number;
};

type PageInfo = { current?: number; totalOfPages?: number };

/** `GET /payout-statement` — relevés et versements de Jumia. */
export async function fetchPayoutStatements(params: {
  createdAfter?: string;
  page?: number;
  size?: number;
  paid?: boolean;
  country?: string;
  currency?: "LOCAL" | "USD";
  /** Compte vendeur Jumia à utiliser (multi-comptes). */
  accountId?: string;
}): Promise<{ statements: PayoutStatement[]; page: PageInfo }> {
  const { accountId: _accountId, ...query } = params;
  const response = await jumiaGet(
    "/payout-statement",
    query,
    params.accountId ? { accountId: params.accountId } : undefined,
  );
  if (!response.ok) {
    throw new Error(`Jumia a répondu HTTP ${response.status} pour /payout-statement.`);
  }
  const body = (await response.json()) as {
    statements?: PayoutStatement[];
    page?: PageInfo;
  };
  return { statements: body.statements ?? [], page: body.page ?? {} };
}

/**
 * Parcourt toutes les pages de relevés de versement, dans la limite de
 * `maxPages` (protection contre le quota Jumia).
 *
 * Un relevé est un document **financier** : lire une seule page donnerait une
 * image partielle des versements. La pagination est donc systématique, et
 * `truncated` signale une lecture incomplète (le nombre lu est alors une
 * borne basse, pas une absence).
 */
export async function fetchAllPayoutStatements(params: {
  createdAfter?: string;
  size?: number;
  maxPages?: number;
  paid?: boolean;
  country?: string;
  currency?: "LOCAL" | "USD";
  accountId?: string;
}): Promise<{ statements: PayoutStatement[]; pages: number; truncated: boolean }> {
  const size = params.size ?? 100;
  const maxPages = Math.max(1, Math.min(params.maxPages ?? 5, 20));
  const collected: PayoutStatement[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPayoutStatements({ ...params, size, page });
    collected.push(...result.statements);

    const totalOfPages = result.page.totalOfPages ?? 0;
    if (result.statements.length === 0) {
      return { statements: collected, pages: page, truncated: false };
    }
    if (totalOfPages && page >= totalOfPages) {
      return { statements: collected, pages: page, truncated: false };
    }
    // Sans `totalOfPages`, une page incomplète signifie « fin des données ».
    if (!totalOfPages && result.statements.length < size) {
      return { statements: collected, pages: page, truncated: false };
    }
  }

  return { statements: collected, pages: maxPages, truncated: true };
}
