import { type Db, templates, withOrg } from '@postrail/db';
import { and, desc, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';

export type TemplateRow = typeof templates.$inferSelect;

export interface NewTemplate {
  slug: string;
  subject: string;
  html: string;
  variables: string[];
}

export interface TemplatePatch {
  subject?: string;
  html?: string;
  variables?: string[];
}

export interface TemplateStore {
  /** Throws CONFLICT when the slug is taken in this org. */
  create: (orgId: string, input: NewTemplate) => Promise<TemplateRow>;
  list: (orgId: string) => Promise<TemplateRow[]>;
  get: (orgId: string, id: string) => Promise<TemplateRow | undefined>;
  update: (orgId: string, id: string, patch: TemplatePatch) => Promise<TemplateRow | undefined>;
  remove: (orgId: string, id: string) => Promise<boolean>;
}

export function createTemplateStore(db: Db): TemplateStore {
  const scoped = (orgId: string, id: string) =>
    and(eq(templates.orgId, orgId), eq(templates.id, id));

  return {
    create: async (orgId, input) => {
      try {
        return await withOrg(db, orgId, async (tx) => {
          const [row] = await tx
            .insert(templates)
            .values({ orgId, ...input })
            .returning();
          if (!row) throw new Error('template insert returned no row');
          return row;
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw AppError.conflict(`template slug "${input.slug}" already exists`);
        throw error;
      }
    },

    list: (orgId) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(templates)
          .where(eq(templates.orgId, orgId))
          .orderBy(desc(templates.createdAt)),
      ),

    get: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select().from(templates).where(scoped(orgId, id)).limit(1);
        return row;
      }),

    update: (orgId, id, patch) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(templates)
          .set({ ...patch, updatedAt: new Date() })
          .where(scoped(orgId, id))
          .returning();
        return row;
      }),

    remove: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(templates)
          .where(scoped(orgId, id))
          .returning({ id: templates.id });
        return rows.length > 0;
      }),
  };
}
