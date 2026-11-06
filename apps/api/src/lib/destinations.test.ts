import { createServer, type IncomingMessage, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BlockedDestinationError,
  createDestinationGuard,
  isPublicAddress,
  type Resolve,
} from './destinations';

const PUBLIC_IP = '93.184.215.14';

/** A resolver that answers from a table; anything else is a public address. */
function table(entries: Record<string, string[]>): Resolve {
  return (hostname) => {
    const addresses = entries[hostname] ?? [PUBLIC_IP];
    if (addresses.length === 0) {
      return Promise.reject(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    }
    return Promise.resolve(
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    );
  };
}

describe('isPublicAddress', () => {
  it.each(['93.184.215.14', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111'])(
    'allows %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1',
    '2002:a00:1::',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('check', () => {
  const guard = createDestinationGuard({
    allowPrivate: false,
    requireHttps: false,
    resolve: table({
      'evil.example.com': ['10.0.0.5'],
      'mixed.example.com': [PUBLIC_IP, '127.0.0.1'],
      'missing.example.com': [],
    }),
  });

  it.each([
    'http://127.0.0.1/hook',
    'http://[::1]/hook',
    'http://2130706433/hook',
    'http://0x7f.0.0.1/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://localhost:4000/hook',
    'https://metadata.google.internal/',
    'https://printer.local/',
    'https://evil.example.com/hook',
    'https://mixed.example.com/hook',
    'https://missing.example.com/hook',
  ])('refuses %s', async (url) => {
    await expect(guard.check(url)).rejects.toBeInstanceOf(BlockedDestinationError);
  });

  it('accepts a public host', async () => {
    await expect(guard.check('https://hooks.example.com/postrail')).resolves.toBeUndefined();
  });

  it('requires https when the policy says so', async () => {
    const strict = createDestinationGuard({
      allowPrivate: false,
      requireHttps: true,
      resolve: table({}),
    });
    await expect(strict.check('http://hooks.example.com/')).rejects.toThrow('https');
    await expect(strict.check('https://hooks.example.com/')).resolves.toBeUndefined();
  });

  it('lets development reach localhost', async () => {
    const dev = createDestinationGuard({ allowPrivate: true, requireHttps: false });
    await expect(dev.check('http://localhost:4000/hook')).resolves.toBeUndefined();
  });
});

describe('fetch', () => {
  let server: Server;
  let port: number;
  const received: Array<{ method: string; body: string; signature: string | undefined }> = [];

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({
          method: req.method ?? '',
          body,
          signature: req.headers['postrail-signature'] as string | undefined,
        });
        if (req.url === '/redirect') {
          res.writeHead(302, { location: 'http://127.0.0.1:1/elsewhere' }).end();
        } else if (req.url === '/slow') {
          setTimeout(() => res.writeHead(200).end(), 500);
        } else {
          res.writeHead(204).end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = { method: 'POST', headers: { 'postrail-signature': 'v1=abc' }, body: '{"a":1}' };

  it('posts and returns the status when private addresses are allowed', async () => {
    const dev = createDestinationGuard({ allowPrivate: true, requireHttps: false });
    const res = await dev.fetch(`http://127.0.0.1:${port}/hook`, post);
    expect(res.status).toBe(204);
    expect(received.at(-1)).toEqual({ method: 'POST', body: '{"a":1}', signature: 'v1=abc' });
  });

  it('refuses a literal private address before connecting', async () => {
    const before = received.length;
    const guard = createDestinationGuard({ allowPrivate: false, requireHttps: false });
    await expect(guard.fetch(`http://127.0.0.1:${port}/hook`, post)).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
    expect(received.length).toBe(before);
  });

  it('refuses a name that resolves privately at connect time (DNS rebinding)', async () => {
    const before = received.length;
    const guard = createDestinationGuard({
      allowPrivate: false,
      requireHttps: false,
      resolve: table({ 'rebind.example.com': ['127.0.0.1'] }),
    });
    await expect(
      guard.fetch(`http://rebind.example.com:${port}/hook`, post),
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(received.length).toBe(before);
  });

  it('connects through the resolver it was given', async () => {
    const dev = createDestinationGuard({
      allowPrivate: true,
      requireHttps: false,
      resolve: table({ 'receiver.test': ['127.0.0.1'] }),
    });
    const res = await dev.fetch(`http://receiver.test:${port}/hook`, post);
    expect(res.status).toBe(204);
  });

  it('returns redirects instead of following them', async () => {
    const dev = createDestinationGuard({ allowPrivate: true, requireHttps: false });
    const res = await dev.fetch(`http://127.0.0.1:${port}/redirect`, post);
    expect(res.status).toBe(302);
  });

  it('gives up when the signal fires', async () => {
    const dev = createDestinationGuard({ allowPrivate: true, requireHttps: false });
    await expect(
      dev.fetch(`http://127.0.0.1:${port}/slow`, { ...post, signal: AbortSignal.timeout(50) }),
    ).rejects.toThrow();
  });
});
