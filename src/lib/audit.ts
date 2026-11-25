import { getDb, schema } from "@/db";

/** Journal d'audit (R4) — toute action sensible y est consignée. */
export type AuditAction =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.password_reset_completed"
  | "auth.account_locked"
  | "auth.telegram_link_code"
  | "auth.telegram_linked"
  | "auth.two_factor_setup_started"
  | "auth.two_factor_enabled"
  | "auth.two_factor_disabled"
  | "auth.two_factor_login"
  | "auth.two_factor_failed"
  | "shop.created"
  | "shop.updated"
  | "shop.selected"
  | "shop.disconnected"
  | "shop.member_invited"
  | "shop.member_removed"
  | "shop.member_role_changed"
  | "notifications.pref_changed"
  | "admin.database_export"
  | "admin.jumia_test"
  | "admin.jumia_shops"
  | "jumia.account_added"
  | "jumia.account_removed"
  | "shop.jumia_linked"
  | "shop.jumia_unlinked"
  | "shop.orders_synced"
  | "shop.products_synced"
  | "shop.stocks_synced"
  | "shop.payments_synced"
  | "shop.full_synced"
  | "shop.data_exported"
  | "product.purchase_price_updated";

export type AuditResult = "success" | "failure" | "blocked";

export async function audit(params: {
  action: AuditAction;
  result: AuditResult;
  userId?: string | null;
  entityType?: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.auditLogs).values({
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType ?? "auth",
      entityId: params.entityId ?? null,
      result: params.result,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      newValue: params.metadata ?? null,
    });
  } catch {
    // Ne jamais faire échouer une requête à cause du journal.
  }
}
