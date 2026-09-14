import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Single shared pool. Postgres transactions (db.transaction) are used
// everywhere a wallet-affecting operation happens, per spec section 14/24:
// "Database transaction/locking mesti mencegah concurrent double-spend."
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { pool };
