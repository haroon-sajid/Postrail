import { createContext, useContext } from 'react';
import type { Org } from '@/api/me';

export interface OrgContextValue {
  org: Org;
  orgs: Org[];
  user: { id: string; email: string; name: string; image: string | null };
  canManage: boolean;
  isOwner: boolean;
}

export const OrgContext = createContext<OrgContextValue | null>(null);

/** The active org, its sibling orgs and the caller's role. Only valid inside the shell. */
export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext);
  if (!value) throw new Error('useOrg must be used inside the app shell');
  return value;
}

export const orgPath = (orgId: string, sub = '') => `/o/${orgId}${sub}`;
