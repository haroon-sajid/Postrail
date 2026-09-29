import { auditLog, type OrgDb } from '@postrail/db';
import { type AuditInput, assertMetaSafe } from './service';

/** Appends one audit row inside the caller's org transaction. */
export async function insertAuditEntry(tx: OrgDb, orgId: string, entry: AuditInput): Promise<void> {
  assertMetaSafe(entry.meta);
  await tx.insert(auditLog).values({
    orgId,
    actor: entry.actor,
    action: entry.action,
    target: entry.target ?? null,
    meta: entry.meta ?? {},
  });
}
