import { type AuthContext, requireRole } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type Queue } from '../../queue/types';
import { type AuditStore } from '../audit/repo';
import { type ContactStore } from '../contacts/repo';
import { type TemplateStore } from '../templates/repo';
import { type BroadcastStore, type BroadcastView, type RecipientCounts } from './repo';
import {
  type Broadcast,
  type BroadcastRecipient,
  type BroadcastRecipientsQuery,
  type CreateBroadcastRequest,
  type UpdateBroadcastRequest,
} from './schemas';
import { dispatchTaskId } from './worker';

export interface BroadcastServiceDeps {
  store: BroadcastStore;
  templates: Pick<TemplateStore, 'get'>;
  contacts: Pick<ContactStore, 'getList' | 'listLists'>;
  queue: Queue;
  audit?: AuditStore;
  now?: () => Date;
}

export interface BroadcastService {
  create: (auth: AuthContext, input: CreateBroadcastRequest) => Promise<Broadcast>;
  list: (auth: AuthContext) => Promise<Broadcast[]>;
  get: (auth: AuthContext, id: string) => Promise<Broadcast>;
  /** Only while it is a draft. */
  update: (auth: AuthContext, id: string, patch: UpdateBroadcastRequest) => Promise<Broadcast>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  /** Freezes the template and the list, then starts handing recipients to delivery. */
  send: (auth: AuthContext, id: string) => Promise<Broadcast>;
  /** Stops a broadcast that is sending. Messages already queued still go out. */
  cancel: (auth: AuthContext, id: string) => Promise<Broadcast>;
  recipients: (
    auth: AuthContext,
    id: string,
    query: BroadcastRecipientsQuery,
  ) => Promise<{ data: BroadcastRecipient[]; nextCursor: string | null }>;
  /** Daily job: sets every broadcast that is still sending going again. Returns how many. */
  resumeAll: () => Promise<number>;
}

const NO_RECIPIENTS: RecipientCounts = {
  total: 0,
  pending: 0,
  queued: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
};

/**
 * Drafts, and the decision to send. Nothing here sends: `send` copies the list and
 * enqueues a dispatch job, and the worker (worker.ts) paces it out from there.
 */
export function createBroadcastService(deps: BroadcastServiceDeps): BroadcastService {
  const { store, templates, contacts, queue, audit } = deps;
  const now = deps.now ?? (() => new Date());

  /** One round for the worker, which queues the rounds after it. */
  const enqueueDispatch = (orgId: string, broadcastId: string) =>
    queue.enqueue(
      { kind: 'dispatch-broadcast', orgId, broadcastId },
      { taskId: dispatchTaskId(broadcastId) },
    );

  /** Template and list ids from the request are only usable once known to be this org's. */
  async function assertTargets(
    orgId: string,
    target: { template_id?: string | undefined; list_id?: string | undefined },
  ): Promise<void> {
    if (target.template_id && !(await templates.get(orgId, target.template_id))) {
      throw AppError.validation('template_id does not match a template in this workspace');
    }
    if (target.list_id && !(await contacts.getList(orgId, target.list_id))) {
      throw AppError.validation('list_id does not match a contact list in this workspace');
    }
  }

  async function viewOr404(orgId: string, id: string): Promise<BroadcastView> {
    const view = await store.get(orgId, id);
    if (!view) throw AppError.notFound('broadcast');
    return view;
  }

  /** Recipient counts once started; before that, how big the chosen list is right now. */
  async function withStats(orgId: string, rows: BroadcastView[]): Promise<Broadcast[]> {
    const started = rows.filter((r) => r.status !== 'draft').map((r) => r.id);
    const counts = await store.counts(orgId, started);
    const sizes = rows.some((r) => r.status === 'draft')
      ? new Map((await contacts.listLists(orgId)).map((l) => [l.id, l.contactCount]))
      : new Map<string, number>();
    return rows.map((row) =>
      toBroadcast(
        row,
        row.status === 'draft'
          ? { ...NO_RECIPIENTS, total: sizes.get(row.listId ?? '') ?? 0 }
          : (counts.get(row.id) ?? NO_RECIPIENTS),
      ),
    );
  }

  async function one(orgId: string, view: BroadcastView): Promise<Broadcast> {
    const [broadcast] = await withStats(orgId, [view]);
    if (!broadcast) throw AppError.notFound('broadcast');
    return broadcast;
  }

  return {
    async create(auth, input) {
      await assertTargets(auth.orgId, input);
      const view = await store.create(auth.orgId, {
        name: input.name,
        templateId: input.template_id,
        listId: input.list_id,
      });
      return one(auth.orgId, view);
    },

    async list(auth) {
      return withStats(auth.orgId, await store.list(auth.orgId));
    },

    async get(auth, id) {
      return one(auth.orgId, await viewOr404(auth.orgId, id));
    },

    async update(auth, id, patch) {
      await assertTargets(auth.orgId, patch);
      const view = await store.updateDraft(auth.orgId, id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.template_id !== undefined ? { templateId: patch.template_id } : {}),
        ...(patch.list_id !== undefined ? { listId: patch.list_id } : {}),
      });
      if (view) return one(auth.orgId, view);
      await viewOr404(auth.orgId, id);
      throw AppError.conflict('only a draft can be changed');
    },

    async remove(auth, id) {
      requireRole(auth, 'admin');
      if (await store.remove(auth.orgId, id)) return;
      await viewOr404(auth.orgId, id);
      throw AppError.conflict('cancel the broadcast before deleting it');
    },

    async send(auth, id) {
      requireRole(auth, 'admin');
      const { orgId } = auth;
      const draft = await viewOr404(orgId, id);
      if (draft.status !== 'draft') throw AppError.conflict(`this broadcast is ${draft.status}`);

      const template = draft.templateId ? await templates.get(orgId, draft.templateId) : undefined;
      if (!template) throw AppError.validation('the template was deleted; choose another');
      const list = draft.listId ? await contacts.getList(orgId, draft.listId) : undefined;
      if (!list) throw AppError.validation('the contact list was deleted; choose another');
      if (list.contactCount === 0) throw AppError.validation('the contact list is empty');

      const recipients = await store.start(
        orgId,
        id,
        { subject: template.subject, html: template.html },
        now(),
      );
      // Lost the race to another request that started it first.
      if (recipients === undefined) throw AppError.conflict('this broadcast is already sending');
      await enqueueDispatch(orgId, id);
      await audit?.record(orgId, {
        actor: auth.actor,
        action: 'broadcast.started',
        target: id,
        meta: { name: draft.name, recipients },
      });
      return one(orgId, await viewOr404(orgId, id));
    },

    async cancel(auth, id) {
      requireRole(auth, 'admin');
      if (!(await store.cancel(auth.orgId, id, now()))) {
        const view = await viewOr404(auth.orgId, id);
        throw AppError.conflict(
          `this broadcast is ${view.status}; only one that is sending can be canceled`,
        );
      }
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'broadcast.canceled',
        target: id,
      });
      return one(auth.orgId, await viewOr404(auth.orgId, id));
    },

    async recipients(auth, id, query) {
      await viewOr404(auth.orgId, id);
      // Recipients are listed by address, which is unique within a broadcast, so the
      // last address on a page is all the cursor needs to carry.
      const after = query.cursor ? decodeEmailCursor(query.cursor) : undefined;
      const rows = await store.recipients(auth.orgId, id, query.limit + 1, after);
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        data: page.map((row) => ({
          id: row.id,
          email: row.email,
          status: row.status,
          message_id: row.messageId,
          error: row.error,
        })),
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(last.email, 'utf8').toString('base64url')
            : null,
      };
    },

    async resumeAll() {
      const sending = await store.listSending();
      for (const { orgId, id } of sending) await enqueueDispatch(orgId, id);
      return sending.length;
    },
  };
}

function decodeEmailCursor(cursor: string): string {
  const email = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!email.includes('@')) throw AppError.validation('invalid cursor');
  return email;
}

function toBroadcast(row: BroadcastView, stats: RecipientCounts): Broadcast {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    template:
      row.templateId && row.templateSlug ? { id: row.templateId, slug: row.templateSlug } : null,
    list: row.listId && row.listName ? { id: row.listId, name: row.listName } : null,
    subject: row.subject,
    stats,
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
