import {
  extractVariables,
  type SendEmailResponse,
  type SendTestTemplateRequest,
} from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type EmailService } from '../emails/service';
import { type TemplateRow, type TemplateStore } from './repo';
import { type CreateTemplateRequest, type Template, type UpdateTemplateRequest } from './schemas';

export interface TemplateServiceDeps {
  store: TemplateStore;
  emails: EmailService;
}

export interface TemplateService {
  create: (auth: AuthContext, input: CreateTemplateRequest) => Promise<Template>;
  list: (orgId: string) => Promise<Template[]>;
  get: (orgId: string, id: string) => Promise<Template>;
  update: (auth: AuthContext, id: string, patch: UpdateTemplateRequest) => Promise<Template>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  /** Queues a real email rendered from this template, through the normal send path. */
  sendTest: (
    auth: AuthContext,
    id: string,
    input: SendTestTemplateRequest,
  ) => Promise<SendEmailResponse>;
}

export function createTemplateService({ store, emails }: TemplateServiceDeps): TemplateService {
  return {
    async create(auth, input) {
      const row = await store.create(auth.orgId, {
        ...input,
        // Derived, never client-supplied: what the renderer will demand at send time.
        variables: extractVariables(input.subject, input.html),
      });
      return toTemplate(row);
    },

    async list(orgId) {
      return (await store.list(orgId)).map(toTemplate);
    },

    async get(orgId, id) {
      const row = await store.get(orgId, id);
      if (!row) throw AppError.notFound('template');
      return toTemplate(row);
    },

    async update(auth, id, patch) {
      const current = await store.get(auth.orgId, id);
      if (!current) throw AppError.notFound('template');
      const subject = patch.subject ?? current.subject;
      const html = patch.html ?? current.html;
      const row = await store.update(auth.orgId, id, {
        subject,
        html,
        variables: extractVariables(subject, html),
      });
      if (!row) throw AppError.notFound('template');
      return toTemplate(row);
    },

    async remove(auth, id) {
      if (!(await store.remove(auth.orgId, id))) throw AppError.notFound('template');
    },

    async sendTest(auth, id, input) {
      const row = await store.get(auth.orgId, id);
      if (!row) throw AppError.notFound('template');
      const outcome = await emails.send(auth, {
        to: input.to,
        template: row.slug,
        ...(input.variables ? { variables: input.variables } : {}),
      });
      return { id: outcome.id, status: outcome.status };
    },
  };
}

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    slug: row.slug,
    subject: row.subject,
    html: row.html,
    variables: row.variables,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
