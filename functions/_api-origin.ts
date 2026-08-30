// Render hosts apps/api on its own domain, separate from this Cloudflare
// Pages site. auth.controller.ts sets the session cookie with
// `sameSite: 'strict'` (deliberately — see 02-add-dual-auth), which the
// browser will never send on a genuinely cross-site request no matter what
// CORS allows. These Pages Functions make the two origins look like one by
// proxying `/api/*` and `/ws` server-side, so the cookie stays same-site
// from the browser's point of view.
export const API_ORIGIN = 'https://pulsedesk-api-u18w.onrender.com';
