// Run this with env vars loaded, e.g.:
//   set -a && source .env.local && set +a && npx tsx src/db/seed.ts
// (ES module import evaluation order means dotenv.config() here would run
// too late to affect ./index's Pool, which reads DATABASE_URL at import
// time — so env vars must already be in the shell environment.)
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { users, goldPrices } from "./schema";
import { newCustomerId } from "@/lib/refs";

async function main() {
  const [existingAdmin] = await db.select().from(users).where(eq(users.phone, "+60100000000")).limit(1);

  let adminId: string;
  if (existingAdmin) {
    adminId = existingAdmin.id;
    console.log("Admin user already exists:", existingAdmin.customerId);
  } else {
    const [admin] = await db
      .insert(users)
      .values({
        customerId: newCustomerId(),
        name: "Miragold Admin",
        phone: "+60100000000",
        role: "OWNER",
        status: "ACTIVE",
        tags: ["SEED"],
      })
      .returning();
    adminId = admin.id;
    console.log("Created admin user:", admin.customerId, admin.phone, "(login via OTP with this phone)");
  }

  const [price] = await db
    .insert(goldPrices)
    .values({
      sellPrice916: "623.00",
      buybackPrice916: "600.00",
      createdBy: adminId,
    })
    .returning();

  console.log("Seeded gold price:", price.sellPrice916, "/ buyback", price.buybackPrice916);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().then(() => process.exit(1));
  });
