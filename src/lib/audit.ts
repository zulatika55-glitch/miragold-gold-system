import { auditLogs } from "@/db/schema";
import type { Executor } from "@/db/types";

export async function writeAuditLog(
  tx: Executor,
  params: {
    actorId?: string | null;
    actorType: "CUSTOMER" | "STAFF" | "SUPERVISOR" | "ADMIN" | "OWNER" | "SYSTEM";
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
) {
  await tx.insert(auditLogs).values({
    actorId: params.actorId ?? null,
    actorType: params.actorType,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    before: params.before ?? null,
    after: params.after ?? null,
    reason: params.reason ?? null,
  });
}
