/**
 * Canned response contracts (06-add-polish tasks.md 1.1/1.2) shared between
 * `apps/api` and `apps/agent-console`. See `libs/contracts/src/lib/tickets.ts`
 * for why these hand-mirror the API's wire shapes instead of importing
 * `@pulsedesk/db` types directly.
 */

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCannedResponseRequest {
  shortcut: string;
  title: string;
  body: string;
}

export interface UpdateCannedResponseRequest {
  shortcut?: string;
  title?: string;
  body?: string;
}

/**
 * Matches a `/shortcut` trigger the agent is actively typing at the END of
 * the reply text — e.g. `"Hi there, /ty"` -> `"ty"`. Deliberately only looks
 * at the trailing fragment (not the whole text, not cursor-position-aware):
 * `PdTextarea` (`libs/ui`) doesn't expose caret/selection position today, so
 * "typing at the end" is the only reliably reachable trigger point without a
 * deeper change to that shared wrapper — documented scope boundary, not an
 * oversight. Returns `null` when there is no trailing `/fragment` to match.
 */
const SHORTCUT_TRIGGER_PATTERN = /\/(\S+)$/;

export function matchShortcutTrigger(text: string): string | null {
  const match = SHORTCUT_TRIGGER_PATTERN.exec(text);
  return match ? match[1] : null;
}

/** Replaces the trailing `/fragment` matched by {@link matchShortcutTrigger}
 * with `body` — the canned response expansion. A no-op (returns `text`
 * unchanged) if there is no trigger to replace. */
export function applyShortcutTrigger(text: string, body: string): string {
  return SHORTCUT_TRIGGER_PATTERN.test(text)
    ? text.replace(SHORTCUT_TRIGGER_PATTERN, body)
    : text;
}
