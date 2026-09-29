/* global process, console, Buffer */
/* eslint-disable no-console -- a CLI script; printing is its job */
// Minimal webhook receiver for testing Postrail signatures locally. No dependencies.
//
//   WEBHOOK_SECRET=whsec_... node examples/webhook-receiver.mjs
//   # then: POST /v1/webhooks { "url": "http://localhost:4000/postrail", "events": ["email.sent"] }
//
// Verification mirrors packages/shared/src/webhooks.ts: HMAC-SHA256 over
// "<Postrail-Timestamp>.<raw body>", hex, compared in constant time, with a 5 minute
// replay window. Always verify against the raw bytes, never a re-serialised object.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4000);
const SECRET = process.env.WEBHOOK_SECRET;
const TOLERANCE_SECONDS = 300;

if (!SECRET) {
  console.error('Set WEBHOOK_SECRET to the secret returned by POST /v1/webhooks');
  process.exit(1);
}

function verify({ secret, body, timestamp, signature }) {
  if (!timestamp || !signature) return false;
  const provided = signature.split(',').find((part) => part.startsWith('v1='));
  if (!provided) return false;

  const ts = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  const actual = Buffer.from(provided.slice(3), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const ok = verify({
      secret: SECRET,
      body,
      timestamp: req.headers['postrail-timestamp'],
      signature: req.headers['postrail-signature'],
    });

    if (!ok) {
      console.log(
        `[${new Date().toISOString()}] REJECTED ${req.headers['postrail-event'] ?? '?'} (bad signature)`,
      );
      res.writeHead(401).end('invalid signature');
      return;
    }

    const payload = JSON.parse(body);
    console.log(
      `[${new Date().toISOString()}] ${payload.event} delivery=${payload.id}`,
      JSON.stringify(payload.data),
    );
    // Reply fast; do real work asynchronously. Anything but 2xx makes Postrail retry.
    res.writeHead(200).end('ok');
  });
}).listen(PORT, () => {
  console.log(`webhook receiver listening on http://localhost:${PORT}/postrail`);
});
