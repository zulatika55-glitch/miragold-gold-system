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

// Fasa 2A — Module 06 (Jual Balik Emas / Buyback), spec section 13.
// "Pending Confirmation" = customer submitted the preview + will confirm via
// OTP; the gram is already placed on hold at this point (spec section 7 —
// the hold must exist before OTP so two devices can't race for the same
// gram). If OTP is never completed, it lazily expires (see
// expireStaleBuybackRequests in src/lib/wallet.ts) and the hold releases.
// "Paid" and "Completed" are deliberately separate steps (not merged) so
// each has its own idempotency guard per spec 19's two distinct rules
// ("Mark Paid twice" and "Complete twice" must each be safe) — the actual
// gram deduction only happens at Complete.
export const buybackStatusEnum = pgEnum("buyback_status", [
  "PENDING_CONFIRMATION",
  "ON_HOLD",
  "PROCESSING",
  "PAID",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);

// Fasa 2B — Module 05 (Tebus Barang Kemas / Jewellery Redemption), spec
// section 15. "Awaiting Customer Confirmation" is where a staff-created
// quotation sits before the customer taps "Sahkan Tebusan" — NO gold hold
// exists yet at this point (spec section 10 says the hold begins only
// "selepas customer confirm"), so a quotation the customer never acts on
// never ties up gram. "Pending Confirmation" is the OTP window that opens
// the instant the customer taps confirm — the hold begins here (mirrors
// buyback's own PENDING_CONFIRMATION), closing the same double-click/
// multi-device race spec section 22 and UAT cases K/L require. "Awaiting
// Payment" / "Payment Confirmed" only apply when there's an RM shortfall to
// pay (spec section 13); a pure-gram redemption skips both and goes
// straight from Pending Confirmation to Processing.
export const redemptionStatusEnum = pgEnum("redemption_status", [
  "AWAITING_CUSTOMER_CONFIRMATION",
  "PENDING_CONFIRMATION",
  "AWAITING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PROCESSING",
  "READY_FOR_FULFILLMENT",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);

export const deliveryMethodEnum = pgEnum("delivery_method", ["PICKUP", "DELIVERY"]);

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
    // Name on the bank account, captured separately from `name` so a
    // genuine mismatch is visible/comparable rather than silently assumed
    // to match (Fasa 2A spec section 9 + sir zul, 22/9: default policy is
    // account holder name MUST equal the Gold Wallet holder's name; a
    // mismatch blocks self-service buyback and routes the customer to
    // manual verification with Miragold).
    bankAccountHolderName: varchar("bank_account_holder_name", { length: 255 }),
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
    // Billplz hosted payment page for this order, saved at creation so a
    // customer who navigated away can resume payment ("Teruskan Pembayaran")
    // from their transaction history while the price lock is still valid.
    billplzUrl: varchar("billplz_url", { length: 512 }),
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
    // Nullable — a payment belongs to exactly one of Module 03 (orders) or
    // Fasa 2B's redemption shortfall payment, never both. Enforced in
    // application code (the Billplz webhook and each creation site), not a
    // DB constraint, to keep this migration a simple additive change.
    // redemptionId has no compile-time .references() because `redemptions`
    // is declared further down this file (after walletLedger, which its own
    // ledgerEntryId needs) — see the comment on that table.
    orderId: uuid("order_id").references(() => orders.id),
    redemptionId: uuid("redemption_id"),
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
    index("payments_redemption_id_idx").on(t.redemptionId),
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
  // Nullable for the same reason as payments.orderId/redemptionId above —
  // this queue now serves both Module 03 orders and Fasa 2B redemptions.
  orderId: uuid("order_id").references(() => orders.id),
  redemptionId: uuid("redemption_id"),
  reason: text("reason").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- buyback_requests (Fasa 2A — Module 06: Jual Balik Emas) ----------
// Customer sells gram back to Miragold. Gram is placed ON HOLD here (NOT
// deducted from wallet_ledger) the moment the request is created, and stays
// held through review + payout. The ledger only gets its BUYBACK -gram
// entry at the final "Complete" step (spec section 7 & 12) — so
// getWalletBalance() keeps reporting the pre-sale ("Total Gold") balance
// right up until completion, while getAvailableGold() (src/lib/wallet.ts)
// subtracts every active request's gram to get what the customer can still
// use — this is exactly the Total/Available/On Hold split spec section 7
// requires, without ever touching the ledger early.
export const buybackRequests = pgTable(
  "buyback_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestRef: varchar("request_ref", { length: 40 }).notNull().unique(), // e.g. JB-20260922-0001

    customerId: uuid("customer_id").notNull().references(() => users.id),

    // Locked at request creation (spec section 5) — never recalculated even
    // if the admin changes the buyback price while this is in flight.
    gram: numeric("gram", { precision: 20, scale: 8 }).notNull(),
    buybackPriceSnapshot: numeric("buyback_price_snapshot", { precision: 18, scale: 6 }).notNull(),
    payoutAmountRm: numeric("payout_amount_rm", { precision: 18, scale: 6 }).notNull(), // gram * price, locked
    goldPriceId: uuid("gold_price_id").references(() => goldPrices.id),

    status: buybackStatusEnum("status").notNull().default("PENDING_CONFIRMATION"),

    // OTP confirmation window (spec section 6 — "transaksi sensitif").
    // Mirrors PRICE_LOCK_MINUTES's role for orders: if the customer never
    // completes OTP within this window, the request lazily expires and its
    // hold is released — see expireStaleBuybackRequests() in wallet.ts.
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }), // set when OTP passes -> ON_HOLD

    // Bank details are SNAPSHOTTED from the customer's profile at request
    // time (spec section 9 shows them on the confirm screen) so a later
    // profile edit never silently changes where an in-flight payout goes.
    bankName: varchar("bank_name", { length: 128 }).notNull(),
    bankAccountNumber: varchar("bank_account_number", { length: 64 }).notNull(),
    bankAccountHolderName: varchar("bank_account_holder_name", { length: 255 }).notNull(),
    bankConfirmedByCustomer: boolean("bank_confirmed_by_customer").notNull().default(false),

    // Admin review (spec section 10).
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"), // required for REJECTED/CANCELLED

    // Manual payout (spec section 11).
    payoutDate: timestamp("payout_date", { withTimezone: true }),
    payoutReference: varchar("payout_reference", { length: 128 }),
    payoutAmountPaid: numeric("payout_amount_paid", { precision: 18, scale: 6 }),
    payoutProcessedBy: uuid("payout_processed_by").references(() => users.id),
    payoutNote: text("payout_note"),

    // Completion — the ONLY point gram actually leaves the wallet.
    completedBy: uuid("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ledgerEntryId: uuid("ledger_entry_id").references(() => walletLedger.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("buyback_requests_customer_id_idx").on(t.customerId),
    index("buyback_requests_status_idx").on(t.status),
    index("buyback_requests_created_at_idx").on(t.createdAt),
  ],
);

// ---------- upah_rates (Fasa 2B — Module 05 redemption labour charge) ----------
// spec section 7: "Jangan hardcode RM60/g dalam source code. Sistem perlu
// benarkan admin masukkan/setting upah kerana kadar Miragold mungkin
// berubah." Versioned exactly like gold_prices so a completed redemption's
// audit trail always shows the rate that was actually in effect when its
// quotation was created (redemptions.upahRatePerGramSnapshot below), even
// after an admin changes the rate later.
export const upahRates = pgTable(
  "upah_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ratePerGram: numeric("rate_per_gram", { precision: 18, scale: 6 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("upah_rates_effective_at_idx").on(t.effectiveAt)],
);

// ---------- redemptions (Fasa 2B — Module 05: Tebus Barang Kemas) ----------
// Customer uses Gold Wallet gram (plus RM for any shortfall) to redeem a
// physical jewellery item. Staff creates the quotation (spec section 2-3);
// the customer reviews it, may lower how much gram to apply (spec section
// 4), then confirms. Gram is placed ON HOLD only once the customer actually
// confirms (spec section 10) — see ACTIVE_HOLD_STATUSES in wallet.ts — and,
// exactly like Buyback, the wallet_ledger only gets its REDEMPTION -gram
// entry at the final "Complete" step (spec section 17), never earlier.
//
// Note on table order: this is declared after `walletLedger` (so
// ledgerEntryId's .references() below is valid) but that means it can't
// itself be the target of a compile-time .references() from `payments` or
// `pendingAllocations` above, which are declared earlier in this file — see
// the comments on their redemptionId columns.
export const redemptions = pgTable(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    redemptionRef: varchar("redemption_ref", { length: 40 }).notNull().unique(), // e.g. RDM-20260926-0001

    customerId: uuid("customer_id").notNull().references(() => users.id),

    // Locked at quotation creation (spec section 2-3) — the staff-entered
    // REAL physical unit weight ("berdasarkan unit barang sebenar ... bukan
    // anggaran design"), never recalculated afterwards.
    productName: varchar("product_name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    itemWeightGram: numeric("item_weight_gram", { precision: 20, scale: 8 }).notNull(),

    // Customer-adjustable (spec section 4) while status is still
    // AWAITING_CUSTOMER_CONFIRMATION; becomes locked the instant OTP
    // confirmation starts (PENDING_CONFIRMATION onward — spec section 14:
    // staff/system must never silently change a confirmed quotation).
    gramUsed: numeric("gram_used", { precision: 20, scale: 8 }).notNull(),

    // Harga Jual 916 — spec section 6: redemption shortfall NEVER uses the
    // Buyback price. Locked at quotation creation, never recalculated even
    // if the admin updates the price while this is in flight (spec 11).
    sellPriceSnapshot: numeric("sell_price_snapshot", { precision: 18, scale: 6 }).notNull(),
    goldPriceId: uuid("gold_price_id").references(() => goldPrices.id),

    // Upah is a fixed amount for the WHOLE item (spec section 7) — it does
    // NOT change when the customer later adjusts gramUsed. Never hardcoded:
    // either computed from the admin-configurable upah_rates table at
    // creation time (upahRatePerGramSnapshot set) or manually typed in by
    // staff, which requires upahOverrideReason when it differs from the
    // computed default.
    upahRatePerGramSnapshot: numeric("upah_rate_per_gram_snapshot", { precision: 18, scale: 6 }),
    upahRm: numeric("upah_rm", { precision: 18, scale: 6 }).notNull(),
    upahOverrideReason: text("upah_override_reason"),

    otherChargesRm: numeric("other_charges_rm", { precision: 18, scale: 6 }).notNull().default("0"),
    postageRm: numeric("postage_rm", { precision: 18, scale: 6 }).notNull().default("0"),

    deliveryMethod: deliveryMethodEnum("delivery_method").notNull().default("PICKUP"),
    deliveryDetails: jsonb("delivery_details"), // address/phone/notes when DELIVERY
    deliveryTrackingReference: varchar("delivery_tracking_reference", { length: 128 }),

    status: redemptionStatusEnum("status").notNull().default("AWAITING_CUSTOMER_CONFIRMATION"),

    // OTP confirmation window (spec section 9), set only once the customer
    // taps "Sahkan Tebusan" — mirrors buyback_requests.otpExpiresAt. This is
    // also the moment gramUsed starts counting as an active hold (see
    // ACTIVE_HOLD_STATUSES / expireStaleRedemptions in wallet.ts).
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }), // set when OTP passes

    // Quotation/price-lock validity for completing payment (spec section 12
    // example: "Harga ini sah selama 15 minit selepas pengesahan"). Only set
    // when there is an RM shortfall to actually pay — a pure-gram redemption
    // (spec section 13's RM0 case) never sets this and skips straight to
    // PROCESSING.
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    billplzUrl: varchar("billplz_url", { length: 512 }),
    paymentConfirmedAt: timestamp("payment_confirmed_at", { withTimezone: true }),

    notes: text("notes"), // staff notes at quotation creation

    // Reject/cancel (spec section 15 exceptions + section 18). One shared
    // pair of fields covers both REJECTED (declined before/at review) and
    // CANCELLED (customer or staff backs out of an in-flight redemption) —
    // spec doesn't give the two states different data requirements.
    cancelReason: text("cancel_reason"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    // Staff begins physically preparing the item (spec: Payment Confirmed ->
    // Processing).
    processedBy: uuid("processed_by").references(() => users.id),
    processedAt: timestamp("processed_at", { withTimezone: true }),

    // Item ready for the customer (spec section 16: Pickup or Delivery).
    readyBy: uuid("ready_by").references(() => users.id),
    readyAt: timestamp("ready_at", { withTimezone: true }),

    // Completion — the ONLY point gram actually leaves the wallet (spec
    // section 17).
    completedBy: uuid("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ledgerEntryId: uuid("ledger_entry_id").references(() => walletLedger.id),

    createdBy: uuid("created_by").notNull().references(() => users.id), // staff who created the quotation

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("redemptions_customer_id_idx").on(t.customerId),
    index("redemptions_status_idx").on(t.status),
    index("redemptions_created_at_idx").on(t.createdAt),
  ],
);
