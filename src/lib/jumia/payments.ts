import { jumiaGet } from "./request";

type PayoutStatement = {
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
}): Promise<{ statements: PayoutStatement[]; page: PageInfo }> {
  const response = await jumiaGet("/payout-statement", params);
  if (!response.ok) {
    throw new Error(`Jumia a répondu HTTP ${response.status} pour /payout-statement.`);
  }
  const body = (await response.json()) as {
    statements?: PayoutStatement[];
    page?: PageInfo;
  };
  return { statements: body.statements ?? [], page: body.page ?? {} };
}
