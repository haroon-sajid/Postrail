import { type TemplateVariables } from './schemas/emails';

/** `{{ name }}`; names are identifiers only, so nothing resembling an expression matches. */
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export interface TemplateSource {
  subject: string;
  html: string;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
}

export class TemplateRenderError extends Error {
  constructor(readonly missing: string[]) {
    super(`missing template variables: ${missing.join(', ')}`);
    this.name = 'TemplateRenderError';
  }
}

/** Distinct placeholder names across the given sources, in order of first appearance. */
export function extractVariables(...sources: string[]): string[] {
  const names = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(PLACEHOLDER)) {
      if (match[1]) names.add(match[1]);
    }
  }
  return [...names];
}

/**
 * Plain string substitution. No expressions, no lookups beyond the variable's own
 * properties (`Object.hasOwn`), so `{{constructor}}` or `{{__proto__}}` render as missing.
 */
export function renderTemplateString(
  source: string,
  variables: TemplateVariables,
  escape: (value: string) => string = (v) => v,
): string {
  return source.replace(PLACEHOLDER, (_, name: string) =>
    Object.hasOwn(variables, name) ? escape(String(variables[name])) : '',
  );
}

/** Subjects are plain text; html bodies get their values HTML-escaped. */
export function renderTemplate(
  template: TemplateSource,
  variables: TemplateVariables,
): RenderedTemplate {
  const missing = extractVariables(template.subject, template.html).filter(
    (name) => !Object.hasOwn(variables, name),
  );
  if (missing.length) throw new TemplateRenderError(missing);
  return {
    subject: renderTemplateString(template.subject, variables),
    html: renderTemplateString(template.html, variables, escapeHtml),
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
