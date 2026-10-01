const ACTIVE_ORG_KEY = 'postrail.active-org';

/**
 * The workspace this browser last worked in. Dashboard URLs no longer carry the org id
 * (ADR 0010), so this is what a fresh tab opens on. It is only a preference: the shell
 * falls back to the user's first org when the stored id is not one of theirs.
 */
export function readActiveOrgId(): string | null {
  return localStorage.getItem(ACTIVE_ORG_KEY);
}

export function writeActiveOrgId(orgId: string): void {
  localStorage.setItem(ACTIVE_ORG_KEY, orgId);
}
