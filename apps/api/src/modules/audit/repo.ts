import { auditLog, type Db, type OrgDb, withOrg } from '@postrail/db';
import { type AuditInput, assertMetaSafe } from './service';

/** For services that audit outside another repo's transaction. */
export interface AuditStore {
  record: (orgId: string, entry: AuditInput) => Promise<void>;
}

export function createAuditStore(db: Db): AuditStore {
  return {
    record: (orgId, entry) => withOrg(db, orgId, (tx) => insertAuditEntry(tx, orgId, entry)),
  };
}

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
