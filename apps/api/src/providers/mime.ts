import { type OutboundMessage } from '@postrail/shared';

const CRLF = '\r\n';

export interface RawMessageInput extends OutboundMessage {
  from: string;
}

/**
 * Builds an RFC 5322 message and returns it base64url-encoded, which is what the Gmail API
 * expects in `raw`. Bodies are base64 so any unicode survives; the subject uses encoded-word.
 */
export function buildRawMessage(input: RawMessageInput): string {
  return Buffer.from(buildMimeMessage(input), 'utf8').toString('base64url');
}

export function buildMimeMessage(input: RawMessageInput): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    ...(input.replyTo ? [`Reply-To: ${input.replyTo}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    // Caller headers are validated upstream (name charset, no line breaks, not reserved).
    ...Object.entries(input.headers ?? {}).map(
      ([name, value]) => `${name}: ${encodeHeader(value)}`,
    ),
    'MIME-Version: 1.0',
  ];

  if (input.text !== undefined && input.html !== undefined) {
    const boundary = `=_postrail_${Date.now().toString(36)}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      ...part('text/plain', input.text),
      `--${boundary}`,
      ...part('text/html', input.html),
      `--${boundary}--`,
      '',
    ].join(CRLF);
  }

  const body = input.html ?? input.text ?? '';
  const type = input.html !== undefined ? 'text/html' : 'text/plain';
  return [...headers, ...part(type, body), ''].join(CRLF);
}

function part(contentType: string, body: string): string[] {
  return [
    `Content-Type: ${contentType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(body, 'utf8').toString('base64')),
  ];
}

/** RFC 2047 encoded-word for anything outside printable ASCII. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function wrap76(base64: string): string {
  return base64.replace(/(.{76})/g, `$1${CRLF}`);
}
