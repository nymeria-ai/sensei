/**
 * Mock HTTP server for integration testing.
 * Responds to POST /execute with canned responses based on input prompt.
 * Responds to GET /health with 200 OK.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

export interface MockServerOptions {
  port?: number;
  responses?: Map<string, string>;
}

const DEFAULT_RESPONSES = new Map<string, string>([
  ['default', 'This is a mock agent response.'],
]);

function findResponse(prompt: string, responses: Map<string, string>): string {
  // Check for substring matches in keys
  for (const [key, value] of responses) {
    if (key !== 'default' && prompt.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return responses.get('default') ?? 'Mock response';
}

export function createMockServer(options: MockServerOptions = {}): {
  server: Server;
  start: () => Promise<number>;
  stop: () => Promise<void>;
  url: () => string;
} {
  const responses = options.responses ?? DEFAULT_RESPONSES;
  let port = options.port ?? 0; // 0 = random available port

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Execute endpoint
    if (req.method === 'POST' && req.url === '/execute') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { task?: string; context?: unknown };
          const prompt = parsed.task ?? '';
          const response = findResponse(prompt, responses);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return {
    server,
    start: () =>
      new Promise<number>((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            port = addr.port;
            resolve(port);
          } else {
            reject(new Error('Failed to get server address'));
          }
        });
        server.on('error', reject);
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    url: () => `http://127.0.0.1:${port}`,
  };
}
