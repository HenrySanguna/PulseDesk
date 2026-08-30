# Widget integration guide

`apps/widget` is the customer-facing chat widget: an anonymous visitor
starts (or resumes) a conversation, which shows up as a ticket in the
agent console (`apps/agent-console`) in real time. This guide is for a
third party embedding it on their own site.

This documents what the widget actually supports **today**. It does not
describe a hosted, no-code embed product (a `<script src="...widget.js">`
snippet that self-configures from a public API key) — that does not exist
yet. What exists is a real, working Angular single-page app plus a small
JS embed snippet you paste in, described below.

## How it works

- `apps/widget` is a standalone Angular app (`pd-widget-chat`, see
  `apps/widget/src/app/chat/`). It has no server-side rendering and no
  multi-tenant configuration — one build serves one PulseDesk backend.
- It talks to `apps/api` over two channels, both same-origin, relative
  paths:
  - `POST /api/widget/conversations` — creates or recovers a conversation
    for the visitor (see `apps/widget/src/app/chat/services/widget-conversation.service.ts`).
    The visitor's identity is a client-generated UUID persisted in the
    widget page's own `localStorage`
    (`pd_widget_customer_session_id`) — no login, no PII required to start
    chatting.
  - `/ws` — the real-time chat channel (send/receive messages, typing,
    presence), authenticated by a short-lived JWT the widget receives
    from the conversation endpoint above.
- Because both of those are relative URLs, **the widget must be served
  from the same origin as `apps/api`** (or behind a reverse proxy that
  makes it look that way) — there is no cross-origin base-URL
  configuration today. This is the same documented limitation
  `apps/agent-console`'s own API client has (see
  `TicketsApiService`'s doc comment) — a real, existing gap in this
  codebase, not something specific to third-party embedding.

## Deploying the widget build

Build the widget the same way any Angular app in this workspace is built:

```sh
pnpm exec nx build widget
```

This produces a static site under `dist/apps/widget`. Serve it from the
same origin as your `apps/api` deployment (e.g. at `/widget/` on that same
host, or behind a reverse proxy that routes `/widget/*` to this build and
`/api/*` + `/ws` to `apps/api`).

## Minimal embed script

Once the widget build is deployed at a URL you control (e.g.
`https://your-domain.example/widget/index.html`), a third-party site can
embed it as a small floating chat launcher with a plain `<script>` tag —
no build step, no framework dependency for the HOST page:

```html
<script>
  (function () {
    var WIDGET_URL = 'https://your-domain.example/widget/index.html';

    var button = document.createElement('button');
    button.textContent = 'Chat with us';
    button.setAttribute('aria-label', 'Open chat');
    button.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:2147483000;' +
      'padding:10px 16px;border-radius:9999px;border:none;cursor:pointer;';

    var frame = document.createElement('iframe');
    frame.src = WIDGET_URL;
    frame.title = 'Chat';
    frame.style.cssText =
      'position:fixed;bottom:72px;right:16px;width:360px;height:520px;' +
      'max-width:calc(100vw - 32px);max-height:calc(100vh - 96px);' +
      'border:none;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.2);' +
      'z-index:2147483000;display:none;';

    button.addEventListener('click', function () {
      frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
    });

    document.body.appendChild(frame);
    document.body.appendChild(button);
  })();
</script>
```

This is intentionally the simplest thing that actually works with what's
built: an `<iframe>` toggled by a launcher button, both injected by one
inline script. There is no PulseDesk-hosted CDN build of this snippet
today — copy it into the integrator's own site (or your own static asset
host) and replace `WIDGET_URL`.

## Configuration

There is no runtime configuration surface today — no query params, no
`data-*` attributes, no public API key. Every visitor gets the same
widget: same branding, same language, same layout. Per-integrator
branding/greeting/position configuration is a reasonable, natural
follow-up, but it is not implemented — this guide does not claim options
that don't exist.

## What you get out of the box

- Persistent conversation across page reloads (same browser, same
  widget origin) via the visitor's `localStorage`-persisted session id.
- Real-time delivery: an agent's reply appears without the visitor
  reloading, and the agent sees a typing indicator while the visitor
  types.
- Automatic reconnect with exponential backoff if the `ws` connection
  drops, including resending a message that never got acknowledged
  before the drop (idempotent by `clientMessageId` — never double-posts
  on retry).
