import { type Db, webhookDeliveries, webhookEndpoints, withOrg, withSystem } from '@postrail/db';
import { type WebhookEvent } from '@postrail/shared';
import { and, arrayContains, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';

export type EndpointRow = typeof webhookEndpoints.$inferSelect;
export type DeliveryRow = typeof webhookDeliveries.$inferSelect;

export interface NewEndpoint {
  url: string;
  events: WebhookEvent[];
  /** Already encrypted; the repo never sees a raw secret. */
  secretEnc: string;
}

export interface EndpointPatch {
  url?: string;
  events?: WebhookEvent[];
}

export interface NewDelivery {
  /** Chosen by the caller so the payload can carry its own id. */
  id: string;
  endpointId: string;
  messageId: string | null;
  event: WebhookEvent;
  payload: Record<string, unknown>;
}

export interface WebhookStore {
  createEndpoint: (orgId: string, input: NewEndpoint) => Promise<EndpointRow>;
  listEndpoints: (orgId: string) => Promise<EndpointRow[]>;
  getEndpoint: (orgId: string, id: string) => Promise<EndpointRow | undefined>;
  updateEndpoint: (
    orgId: string,
    id: string,
    patch: EndpointPatch,
  ) => Promise<EndpointRow | undefined>;
  deleteEndpoint: (orgId: string, id: string) => Promise<boolean>;
  listEndpointsForEvent: (orgId: string, event: WebhookEvent) => Promise<EndpointRow[]>;
  createDelivery: (orgId: string, input: NewDelivery) => Promise<DeliveryRow>;
  /** Atomic pending -> sending with attempts + 1; undefined when not claimable. */
  claimDelivery: (
    orgId: string,
    id: string,
    leaseMs: number,
    now: Date,
  ) => Promise<DeliveryRow | undefined>;
  markDelivered: (orgId: string, id: string, responseCode: number) => Promise<void>;
  scheduleDeliveryRetry: (
    orgId: string,
    id: string,
    error: string,
    responseCode: number | null,
    nextRetryAt: Date,
  ) => Promise<void>;
  markDeliveryFailed: (
    orgId: string,
    id: string,
    error: string,
    responseCode: number | null,
  ) => Promise<void>;
  listDeliveries: (orgId: string, endpointId: string, limit: number) => Promise<DeliveryRow[]>;
  getDelivery: (orgId: string, id: string) => Promise<DeliveryRow | undefined>;
  /** Manual retry: back to pending regardless of the current state. */
  requeueDelivery: (orgId: string, id: string) => Promise<void>;
  updateSecret: (orgId: string, id: string, secretEnc: string) => Promise<boolean>;
  /**
   * Cross-tenant, for the scheduler's sweep: deliveries long past their retry time, and
   * deliveries whose sending lease has lapsed. The task that should move them was lost.
   */
  findStalledDeliveries: (
    now: Date,
    graceMs: number,
    leaseMs: number,
    limit: number,
  ) => Promise<Array<{ orgId: string; id: string }>>;
  /** Cross-tenant, for retention: deletes finished deliveries created before `before`. */
  deleteDeliveriesBefore: (before: Date, limit: number) => Promise<number>;
}

export function createWebhookStore(db: Db): WebhookStore {
  const endpointScoped = (orgId: string, id: string) =>
    and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, id));
  const deliveryScoped = (orgId: string, id: string) =>
    and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.id, id));

  return {
    createEndpoint: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(webhookEndpoints)
          .values({ orgId, url: input.url, events: input.events, secret: input.secretEnc })
          .returning();
        if (!row) throw new Error('webhook insert returned no row');
        return row;
      }),

    listEndpoints: (orgId) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(webhookEndpoints)
          .where(eq(webhookEndpoints.orgId, orgId))
          .orderBy(desc(webhookEndpoints.createdAt)),
      ),

    getEndpoint: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(webhookEndpoints)
          .where(endpointScoped(orgId, id))
          .limit(1);
        return row;
      }),

    updateEndpoint: (orgId, id, patch) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(webhookEndpoints)
          .set({ ...patch, updatedAt: new Date() })
          .where(endpointScoped(orgId, id))
          .returning();
        return row;
      }),

    deleteEndpoint: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(webhookEndpoints)
          .where(endpointScoped(orgId, id))
          .returning({ id: webhookEndpoints.id });
        return rows.length > 0;
      }),

    listEndpointsForEvent: (orgId, event) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(webhookEndpoints)
          .where(
            and(eq(webhookEndpoints.orgId, orgId), arrayContains(webhookEndpoints.events, [event])),
          ),
      ),

    createDelivery: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(webhookDeliveries)
          .values({ orgId, ...input, status: 'pending' })
          .returning();
        if (!row) throw new Error('delivery insert returned no row');
        return row;
      }),

    claimDelivery: (orgId, id, leaseMs, now) =>
      withOrg(db, orgId, async (tx) => {
        const staleBefore = new Date(now.getTime() - leaseMs);
        const [row] = await tx
          .update(webhookDeliveries)
          .set({
            status: 'sending',
            attempts: sql`${webhookDeliveries.attempts} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              deliveryScoped(orgId, id),
              or(
                eq(webhookDeliveries.status, 'pending'),
                and(
                  eq(webhookDeliveries.status, 'sending'),
                  lt(webhookDeliveries.updatedAt, staleBefore),
                ),
              ),
            ),
          )
          .returning();
        return row;
      }),

    markDelivered: (orgId, id, responseCode) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({ status: 'delivered', responseCode, error: null, nextRetryAt: null })
          .where(deliveryScoped(orgId, id));
      }),

    scheduleDeliveryRetry: (orgId, id, error, responseCode, nextRetryAt) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({ status: 'pending', error, responseCode, nextRetryAt })
          .where(deliveryScoped(orgId, id));
      }),

    markDeliveryFailed: (orgId, id, error, responseCode) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({ status: 'failed', error, responseCode, nextRetryAt: null })
          .where(deliveryScoped(orgId, id));
      }),

    getDelivery: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(webhookDeliveries)
          .where(deliveryScoped(orgId, id))
          .limit(1);
        return row;
      }),

    requeueDelivery: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({ status: 'pending', nextRetryAt: null, updatedAt: new Date() })
          .where(deliveryScoped(orgId, id));
      }),

    updateSecret: (orgId, id, secretEnc) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(webhookEndpoints)
          .set({ secret: secretEnc, updatedAt: new Date() })
          .where(endpointScoped(orgId, id))
          .returning({ id: webhookEndpoints.id });
        return rows.length > 0;
      }),

    listDeliveries: (orgId, endpointId, limit) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(webhookDeliveries)
          .where(
            and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.endpointId, endpointId)),
          )
          .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
          .limit(limit),
      ),

    // withSystem: the scheduler looks for lost work across every tenant at once.
    findStalledDeliveries: (now, graceMs, leaseMs, limit) =>
      withSystem(db, (tx) => {
        // A new or manually retried delivery has no retry time; it was due when last touched.
        const due = sql`coalesce(${webhookDeliveries.nextRetryAt}, ${webhookDeliveries.updatedAt})`;
        return tx
          .select({ orgId: webhookDeliveries.orgId, id: webhookDeliveries.id })
          .from(webhookDeliveries)
          .where(
            or(
              and(
                eq(webhookDeliveries.status, 'pending'),
                // A raw expression has no column type to map a Date through; send ISO text.
                lt(due, new Date(now.getTime() - graceMs).toISOString()),
              ),
              and(
                eq(webhookDeliveries.status, 'sending'),
                lt(webhookDeliveries.updatedAt, new Date(now.getTime() - leaseMs)),
              ),
            ),
          )
          .orderBy(asc(due))
          .limit(limit);
      }),

    // withSystem: retention spans every tenant. Deliveries still in flight are kept.
    deleteDeliveriesBefore: (before, limit) =>
      withSystem(db, async (tx) => {
        const old = tx
          .select({ id: webhookDeliveries.id })
          .from(webhookDeliveries)
          .where(
            and(
              lt(webhookDeliveries.createdAt, before),
              inArray(webhookDeliveries.status, ['delivered', 'failed']),
            ),
          )
          .limit(limit);
        const deleted = await tx
          .delete(webhookDeliveries)
          .where(inArray(webhookDeliveries.id, old))
          .returning({ id: webhookDeliveries.id });
        return deleted.length;
      }),
  };
}
