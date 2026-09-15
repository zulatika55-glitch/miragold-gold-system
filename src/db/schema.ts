import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  pgEnum,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * MIRAGOLD Gold Saving System V1 — Core data model
 * Derived from Master Specification section 18 (Minimum Data Model) and
 * section 14 (Transaction Status & Ledger Rules).
 *
 * Golden rule (spec): BALANCE = hasil ledger. wallet balance is NEVER
 * stored as a directly-editable number — it is always derived by summing
 * wallet_ledger rows for a customer. See src/lib/wallet.ts.
 *
 * Decimal-safety: all money (RM) and gold (gram) columns use Postgres
 * NUMERIC with high precision and are handled in application code with
 * decimal.js (see src/lib/decimal.ts) — never native floating point.
 */

// ---------- Enums ----------

export const accountStatusEnum = pgEnum("account_status", [
  "ACTIVE",
  "SUSPENDED",
  "REVIEW",
  "CLOSED",
]);

export const userRoleEnum = pgEnum("user_role", [
  "CUSTOMER",
  "STAFF",
  "SUPERVISOR",
  "ADMIN",
  "OWNER",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING", // created, awaiting payment, price still locked within window
  "CONFIRMED", // payment confirmed by gateway, wallet credit in progress
  "COMPLETED", // gram credited to wallet
  "FAILED", // payment failed
  "EXPIRED", // price-lock window expired before payment
  "CANCELLED",
  "REVERSED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "REVERSED",
]);

export const ledgerTypeEnum = pgEnum("ledger_type", [
  "LOCK_BUY", // Module 03 — customer buys/locks gram
  "REDEMPTION", // Module 05 — redeem jewellery
  "BUYBACK", // Module 06 — sell gram back
  "CONVERSION", // Module 07 — 916 -> 999.9
  "TRADE_IN", // Module 08
  "ADJUSTMENT", // manual, controlled, must have reason + approver
  "REVERSAL", // reverses a prior ledger entry, references original
]);

export const ledgerDirectionEnum = pgEnum("ledger_direction", ["IN", "OUT"]);

export const actorTypeEnum = pgEnum("actor_type", [
  "CUSTOMER",
  "STAFF",
  "SUPERVISOR",
  "ADMIN",
  "OWNER",
  "SYSTEM",
]);

// ---------- users ----------
// spec: users | customer_id, name, phone, email, status, tags, timestamps

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: varchar("customer_id", { length: 32 }).notNull().unique(), // human-facing unique ID, e.g. MG-000123
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull().unique(),
    email: varchar("email", { length: 255 }),
    role: userRoleEnum("role").notNull().default("CUSTOMER"),
    status: accountStatusEnum("status").notNull().default("ACTIVE"),
    // internal STAFF/PILOT tag per spec 5.1 — never a separate employee login
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
    bankName: varchar("bank_name", { length: 128 }),
    bankAccountNumber: varchar("bank_account_number", { length: 64 }),
    bankDetailsUpdatedAt: timestamp("bank_details_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("users_phone_idx").on(t.phone),
    index("users_customer_id_idx").on(t.customerId),
  ],
);

// ---------- otp_codes ----------
// supports Module 02 phone + OTP login. Provider is swappable (src/lib/otp.ts);
// this table just tracks issued codes for verification + rate limiting.

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 32 }).notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: numeric("attempts", { precision: 4, scale: 0 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_codes_phone_idx").on(t.phone)],
);

// ---------- gold_prices ----------
// spec: gold_prices | sell_price_916, buyback_price_916, effective_at, created_by

export const goldPrices = pgTable(
  "gold_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellPrice916: numeric("sell_price_916", { precision: 18, scale: 6 }).notNull(),
    buybackPrice916: numeric("buyback_price_916", { precision: 18, scale: 6 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gold_prices_effective_at_idx").on(t.effectiveAt)],
);

// ---------- orders (Lock / Buy Emas 916) ----------
// spec: orders | order_id, customer_id, amount_rm, price_snapshot, gram, expiry, status

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderRef: varchar("order_ref", { length: 40 }).notNull().unique(), // e.g. ORD-20260909-0001
    customerId: uuid("customer_id").notNull().references(() => users.id),
    amountRm: numeric("amount_rm", { precision: 18, scale: 6 }).notNull(),
    priceSnapshot: numeric("price_snapshot", { precision: 18, scale: 6 }).notNull(), // sell price locked at checkout
    gram: numeric("gram", { precision: 20, scale: 8 }).notNull(), // amountRm / priceSnapshot
    goldPriceId: uuid("gold_price_id").references(() => goldPrices.id),
    status: orderStatusEnum("status").notNull().default("PENDING"),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_customer_id_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
  ],
);

// ---------- payments ----------
// spec: payments | payment_id, order_id, provider_ref, amount, status, confirmed_at

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentRef: varchar("payment_ref", { length: 40 }).notNull().unique(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    provider: varchar("provider", { length: 32 }).notNull().default("BILLPLZ"),
    providerBillId: varchar("provider_bill_id", { length: 128 }), // Billplz bill id
    // idempotency: one provider event id may only allocate gram once (spec 14 & 16.4)
    idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull().unique(),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    rawPayload: jsonb("raw_payload"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_order_id_idx").on(t.orderId),
    uniqueIndex("payments_idempotency_key_idx").on(t.idempotencyKey),
  ],
);

// ---------- wallet_ledger ----------
// spec: wallet_ledger | ledger_id, customer_id, type, gram_in/out, ref_id, balance_after, timestamp
// This is the single source of truth for wallet balance (golden rule, spec table under Module 04).

export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerRef: varchar("ledger_ref", { length: 40 }).notNull().unique(),
    customerId: uuid("customer_id").notNull().references(() => users.id),
    type: ledgerTypeEnum("type").notNull(),
    direction: ledgerDirectionEnum("direction").notNull(),
    gram: numeric("gram", { precision: 20, scale: 8 }).notNull(), // always positive; direction gives sign
    priceSnapshot: numeric("price_snapshot", { precision: 18, scale: 6 }), // sell/buyback price at time of entry, if relevant
    refType: varchar("ref_type", { length: 32 }).notNull(), // 'ORDER' | 'REDEMPTION' | 'BUYBACK' | 'ADJUSTMENT' | ...
    refId: varchar("ref_id", { length: 40 }).notNull(), // human ref (order_ref/payment_ref/etc)
    balanceAfter: numeric("balance_after", { precision: 20, scale: 8 }).notNull(),
    reversalOfLedgerId: uuid("reversal_of_ledger_id"),
    reason: text("reason"), // required for ADJUSTMENT / REVERSAL
    createdBy: uuid("created_by").references(() => users.id), // null = system (e.g. payment webhook)
    approvedBy: uuid("approved_by").references(() => users.id), // required for ADJUSTMENT
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wallet_ledger_customer_id_idx").on(t.customerId),
    index("wallet_ledger_timestamp_idx").on(t.timestamp),
  ],
);

// ---------- audit_logs ----------
// spec: audit_logs | actor, action, entity, before/after, reason, timestamp

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }).notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_timestamp_idx").on(t.timestamp),
  ],
);

// ---------- pending_allocations ----------
// spec 16.3: "Payment success but wallet failure -> PAYMENT RECEIVED / PENDING ALLOCATION queue"
// Recoverable queue so an admin can see and retry/allocate stuck payments.

export const pendingAllocations = pgTable("pending_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  reason: text("reason").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
