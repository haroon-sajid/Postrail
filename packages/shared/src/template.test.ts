import { describe, expect, it } from 'vitest';
import {
  extractVariables,
  renderTemplate,
  renderTemplateString,
  TemplateRenderError,
} from './template';

describe('extractVariables', () => {
  it('finds distinct identifiers in order and ignores non-identifiers', () => {
    expect(extractVariables('Hi {{ name }}, {{name}} {{code_1}}', '{{a.b}} {{1x}} {{ok}}')).toEqual(
      ['name', 'code_1', 'ok'],
    );
  });
});

describe('renderTemplateString', () => {
  it('substitutes and escapes only through the provided escaper', () => {
    expect(renderTemplateString('<b>{{v}}</b>', { v: '<i>' })).toBe('<b><i></b>');
    expect(renderTemplateString('<b>{{v}}</b>', { v: '<i>' }, (s) => s.toUpperCase())).toBe(
      '<b><I></b>',
    );
  });

  it('never executes anything and never reaches prototype properties', () => {
    const attack = '{{constructor}} {{__proto__}} {{toString}} ${1+1} <%= 1 %> {{ x }}';
    expect(renderTemplateString(attack, { x: '${2+2}' })).toBe('   ${1+1} <%= 1 %> ${2+2}');
  });

  it('stringifies numbers and booleans', () => {
    expect(renderTemplateString('{{n}}/{{b}}', { n: 12, b: false })).toBe('12/false');
  });
});

describe('renderTemplate', () => {
  const template = { subject: 'Welcome {{name}}', html: '<p>{{name}}: {{code}}</p>' };

  it('renders subject plain and html escaped', () => {
    expect(renderTemplate(template, { name: '<Ada>', code: 42 })).toEqual({
      subject: 'Welcome <Ada>',
      html: '<p>&#60;Ada&#62;: 42</p>',
    });
  });

  it('lists every missing variable', () => {
    let error: unknown;
    try {
      renderTemplate(template, {});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TemplateRenderError);
    expect((error as TemplateRenderError).missing).toEqual(['name', 'code']);
  });
});
