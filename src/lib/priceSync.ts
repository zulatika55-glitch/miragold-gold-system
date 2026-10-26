import { db } from "@/db";
import { goldPrices, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";
import { toDecimal, formatRm } from "@/lib/decimal";

/**
 * Auto-sync Emas 916 price from Miragold's own public website, so the shop
 * team only has to update price ONCE (on miragold.my) and the Gold Wallet
 * follows automatically — sir zul, 19/9.
 *
 * miragold.my already exposes a clean, structured JSON file (no scraping of
 * HTML needed):
 *   https://miragold.my/daily_price_state.json
 *   { "price_member": "582", "price_non_member": "585",
 *     "price_tradein": "510", "price_selling": "505",
 *     "price_goldbar": "670", "price_last_update": "19/9/2026", ... }
 *
 * Field mapping (confirmed default — override via env if the shop's
 * definition of these fields ever changes):
 *   - Harga Jual (sellPrice916)     <- price_member   (member buying price)
 *   - Harga Beli Balik (buyback)    <- price_selling  (cash buyback rate)
 */

const SOURCE_URL = process.env.MIRAGOLD_PRICE_SYNC_URL ?? "https://miragold.my/daily_price_state.json";
const SELL_FIELD = process.env.PRICE_SYNC_SELL_FIELD ?? "price_member";
const BUYBACK_FIELD = process.env.PRICE_SYNC_BUYBACK_FIELD ?? "price_selling";
// Kept short on purpose (sir zul, 19/9): this is real money — if the market
// price rises on miragold.my while our own price is still stale, a customer
// can lock a Buy order at the old, cheaper price during that gap and
// Miragold eats the difference. A 5-minute gap on top of the 10-minute
// price-lock window meant up to ~15 minutes of stale-price exposure; a
// 30-second check keeps that add-on exposure to well under a minute. The
// fetch itself is a tiny JSON file, so checking this often is cheap.
const INTERVAL_SECONDS = Number(process.env.PRICE_SYNC_INTERVAL_SECONDS ?? "30");
// Same 10% guard as the manual admin price form (Loophole 16.6) — a typo or
// a bad value on the website's side must never silently blow past this.
const WARN_THRESHOLD = 0.1;

type MiragoldPriceState = Record<string, unknown>;

function extractPositiveNumber(data: MiragoldPriceState, field: string): number | null {
  const raw = data[field];
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Fetch + validate the latest price from miragold.my. Never throws — a
 * malformed response or a down website must never crash the sync loop or
 * silently write garbage into gold_prices.
 */
async function fetchMiragoldPrice(): Promise<{ sell: number; buyback: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(SOURCE_URL, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      console.error(`[priceSync] miragold.my returned HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as MiragoldPriceState;
    const sell = extractPositiveNumber(data, SELL_FIELD);
    const buyback = extractPositiveNumber(data, BUYBACK_FIELD);

    if (sell === null || buyback === null) {
      console.error(
        `[priceSync] missing/invalid fields in miragold.my response (expected "${SELL_FIELD}" and "${BUYBACK_FIELD}"):`,
        data,
      );
      return null;
    }

    return { sell, buyback };
  } catch (err) {
    console.error("[priceSync] failed to fetch/parse miragold.my price:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Runs one sync check: fetch the live price, and if it genuinely changed
 * from what's already in gold_prices, insert a new row exactly like a
 * manual admin update would (same audit trail, same >10% guard) — except
 * an unusual jump is never auto-applied, only flagged for a human to check
 * in Urus Harga Emas 916.
 */
export async function runPriceSync(): Promise<void> {
  const fetched = await fetchMiragoldPrice();
  if (!fetched) return;

  const [previous] = await db.select().from(goldPrices).orderBy(desc(goldPrices.effectiveAt)).limit(1);

  const newSell = toDecimal(fetched.sell);
  const newBuyback = toDecimal(fetched.buyback);

  if (previous) {
    const unchanged = toDecimal(previous.sellPrice916).eq(newSell) && toDecimal(previous.buybackPrice916).eq(newBuyback);
    if (unchanged) return; // nothing to do — avoid flooding gold_prices every interval

    const changeRatio = toDecimal(previous.sellPrice916).minus(newSell).abs().dividedBy(previous.sellPrice916);
    if (changeRatio.gt(WARN_THRESHOLD)) {
      console.warn(
        `[priceSync] SKIPPED auto-apply: miragold.my sell price RM${formatRm(newSell)} differs from previous RM${formatRm(previous.sellPrice916)} by more than 10%. Needs manual review in Urus Harga Emas 916.`,
      );
      await writeAuditLog(db, {
        actorType: "SYSTEM",
        action: "PRICE_AUTO_SYNC_SKIPPED_LARGE_CHANGE",
        entity: "gold_prices",
        entityId: previous.id,
        before: previous,
        after: { sellPrice916: formatRm(newSell), buybackPrice916: formatRm(newBuyback), source: SOURCE_URL },
        reason: "Change from miragold.my exceeds 10% guard — applied manually instead of auto-syncing.",
      });
      return;
    }
  }

  const [created] = await db
    .insert(goldPrices)
    .values({
      sellPrice916: newSell.toFixed(6),
      buybackPrice916: newBuyback.toFixed(6),
      // No admin user triggered this — createdBy stays null so it's visibly
      // distinguishable from a manual update in gold_prices history.
    })
    .returning();

  await writeAuditLog(db, {
    actorType: "SYSTEM",
    action: "PRICE_AUTO_SYNC",
    entity: "gold_prices",
    entityId: created.id,
    before: previous ?? null,
    after: created,
    reason: `Auto-synced from ${SOURCE_URL}`,
  });

  console.log(`[priceSync] Applied new price from miragold.my: sell RM${formatRm(created.sellPrice916)}, buyback RM${formatRm(created.buybackPrice916)}`);
}

/**
 * One-time self-heal for the 26/10 incident: several seed-runner redeploys
 * during an unrelated Postgres credential rotation re-ran `db:seed`, and
 * (before db:seed's own fix, same commit as this) its unconditional
 * gold_prices insert stamped fresh "623.00 / 600.00" test-price rows on
 * top of the real synced price every time. Those rows are always created
 * by the dedicated SEED admin user (phone +60100000000, tags: ["SEED"])
 * with that exact literal value pair — a genuine human price update never
 * matches both — so this is narrowly scoped to just that signature and
 * safe to leave running permanently: once the contaminated rows are gone
 * it is a no-op forever after.
 *
 * Why this has to run here rather than sir zul fixing it once by hand in
 * Urus Harga Emas 916: he asked for the price to recover on its own, not
 * for a one-off manual form submission — so this removes the bad rows
 * automatically on boot, which uncovers whatever legitimate price was
 * underneath, and the very next sync check below compares against that
 * real baseline instead of the fake one, letting the normal >10% guard
 * (correctly) stop blocking recovery.
 */
async function repairSeedContaminatedPrice(): Promise<void> {
  const [seedAdmin] = await db.select().from(users).where(eq(users.phone, "+60100000000")).limit(1);
  if (!seedAdmin) return;

  const contaminated = await db
    .select()
    .from(goldPrices)
    .where(
      and(
        eq(goldPrices.createdBy, seedAdmin.id),
        eq(goldPrices.sellPrice916, "623.000000"),
        eq(goldPrices.buybackPrice916, "600.000000"),
      ),
    );
  if (contaminated.length === 0) return;

  for (const row of contaminated) {
    await db.delete(goldPrices).where(eq(goldPrices.id, row.id));
    await writeAuditLog(db, {
      actorType: "SYSTEM",
      action: "PRICE_SEED_CONTAMINATION_REPAIR",
      entity: "gold_prices",
      entityId: row.id,
      before: row,
      after: null,
      reason:
        "26/10 incident: seed-runner re-ran db:seed and inserted a test price over the real synced price; removed so auto-sync could recover on its own.",
    });
  }
  console.log(`[priceSync] Removed ${contaminated.length} seed-contaminated test-price row(s) from the 26/10 incident.`);
}

let started = false;

/**
 * Starts the recurring background sync. Safe to call more than once (e.g.
 * hot-reload in dev) — only ever schedules one interval per server process.
 */
export function startPriceSyncScheduler(): void {
  if (started) return;
  started = true;

  // Floor at 10s — fast enough to close the stale-price gap, not so fast it
  // hammers miragold.my for no reason.
  const intervalMs = Math.max(10, INTERVAL_SECONDS) * 1000;
  console.log(`[priceSync] Auto price sync enabled — checking ${SOURCE_URL} every ${INTERVAL_SECONDS} second(s).`);

  // Clean up any 26/10-incident contamination first, THEN start the regular
  // sync loop — so the very first real sync check compares against a real
  // baseline rather than the fake seeded one.
  void repairSeedContaminatedPrice()
    .catch((err) =>
      console.error("[priceSync] contamination repair failed:", err instanceof Error ? err.message : err),
    )
    .finally(() => {
      setTimeout(() => void runPriceSync(), 3_000);
      setInterval(() => void runPriceSync(), intervalMs);
    });
}
