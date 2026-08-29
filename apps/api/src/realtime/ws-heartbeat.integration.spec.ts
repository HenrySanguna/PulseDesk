import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { attachHeartbeat } from './ws-heartbeat.js';

/**
 * Real `ws` socket pair proof of tasks.md 2.4 / spec "Cierre de conexiones
 * ws inactivas" (test 5.2): a connection that stops responding to ping is
 * closed by the server, and a connection that keeps responding stays open.
 * No Nest bootstrap needed — heartbeat detection is pure `ws` mechanics,
 * exercised here directly against a real `net` socket pair (short
 * intervals so the test runs in well under a second, not the real 30s/10s
 * production values).
 */
describe('attachHeartbeat (real ws sockets)', () => {
  let wss: WebSocketServer | undefined;

  afterEach(() => {
    wss?.close();
    wss = undefined;
  });

  function listen(): Promise<{ server: WebSocketServer; url: string }> {
    return new Promise((resolve) => {
      const server = new WebSocketServer({ port: 0 }, () => {
        const { port } = server.address() as AddressInfo;
        resolve({ server, url: `ws://127.0.0.1:${port}` });
      });
    });
  }

  it('5.2: a socket that stops responding to ping is closed by the server within interval + grace', async () => {
    const { server, url } = await listen();
    wss = server;

    const serverClosed = new Promise<void>((resolve) => {
      server.on('connection', (serverSocket) => {
        attachHeartbeat(serverSocket, { intervalMs: 150, graceMs: 100 });
        serverSocket.once('close', () => resolve());
      });
    });

    const client = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });

    // Simulate a genuinely dead connection: pause the client's underlying
    // TCP socket so it never processes incoming frames (including the
    // server's ping, which `ws` would otherwise auto-pong at the protocol
    // level) — a real network-level simulation, not a framework-internal
    // shortcut around the heartbeat logic under test.
    (client as unknown as { _socket: { pause: () => void } })._socket.pause();

    const start = Date.now();
    await serverClosed;
    const elapsedMs = Date.now() - start;

    // Must close roughly after one ping+grace cycle (150 + 100 = 250ms),
    // not immediately and not after several missed cycles.
    expect(elapsedMs).toBeGreaterThanOrEqual(150);
    expect(elapsedMs).toBeLessThan(1000);
  }, 5000);

  it('a socket that keeps responding to ping (default ws auto-pong) is never closed by the heartbeat', async () => {
    const { server, url } = await listen();
    wss = server;
    let detach: () => void = () => undefined;

    server.on('connection', (serverSocket) => {
      detach = attachHeartbeat(serverSocket, { intervalMs: 100, graceMs: 80 });
    });

    const client = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });

    // Several full ping/grace cycles' worth of real time.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(client.readyState).toBe(WebSocket.OPEN);
    detach();
    client.close();
  }, 5000);
});
