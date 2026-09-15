import { db } from "./index";

/** Either the top-level `db` client or a `tx` inside `db.transaction(...)`.
 * Both support .select/.insert/.update/.execute, so helpers that may run
 * standalone or inside a larger transaction can accept either. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
