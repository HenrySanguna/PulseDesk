/** Widget conversation tokens are ephemeral JWTs, scoped to exactly one
 * conversation — deliberately NOT the opaque/Valkey mechanism used for
 * agent sessions, since a widget visitor's identity needs no server-side
 * revocation and the widget channel is `ws`, not `EventSource`, so a
 * bearer header is viable. See openspec/project.md and 02-add-dual-auth's
 * design.md. */
export const WIDGET_TOKEN_TTL = '4h';
