import { API_ORIGIN } from './_api-origin.js';

// Proxies the /ws upgrade (see native-ws.adapter.ts's WS_PATH) to the real
// apps/api deployment, same reasoning as functions/api/[[path]].ts. A
// Workers `fetch()` against an origin that completes the WebSocket
// handshake returns a `webSocket` on the Response; handing that same
// object back as this Response's `webSocket` bridges the two sockets --
// no manual WebSocketPair/message relay needed, since neither end
// terminates here.
export const onRequest: PagesFunction = async (context) => {
  const upgradeHeader = context.request.headers.get('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const url = new URL(context.request.url);
  const target = `${API_ORIGIN}${url.pathname}${url.search}`;

  const upstream = await fetch(target, {
    headers: context.request.headers,
  });

  if (!upstream.webSocket) {
    return new Response('Upstream did not accept the WebSocket', {
      status: 502,
    });
  }

  return new Response(null, { status: 101, webSocket: upstream.webSocket });
};
