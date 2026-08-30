import { API_ORIGIN } from '../_api-origin.js';

// Catches every `/api/*` request (agent-console and widget both call the
// API through this relative path — see auth-api.service.ts,
// tickets-api.service.ts, etc.) and forwards it to the real apps/api
// deployment, unchanged, so cookies and CORS stay same-site.
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const target = `${API_ORIGIN}${url.pathname}${url.search}`;

  const upstream = await fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method)
      ? undefined
      : context.request.body,
    // @ts-expect-error -- Workers-only RequestInit field, required to
    // stream a body through without buffering it first.
    duplex: 'half',
  });

  return new Response(upstream.body, upstream);
};
