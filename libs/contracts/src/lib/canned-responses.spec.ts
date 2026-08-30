import { describe, expect, it } from 'vitest';
import { applyShortcutTrigger, matchShortcutTrigger } from './canned-responses.js';

describe('matchShortcutTrigger', () => {
  it('matches a trailing /shortcut fragment', () => {
    expect(matchShortcutTrigger('Hi there, /ty')).toBe('ty');
  });

  it('matches a bare trailing /shortcut with no preceding text', () => {
    expect(matchShortcutTrigger('/refund')).toBe('refund');
  });

  it('returns null when there is no trailing slash', () => {
    expect(matchShortcutTrigger('Hi there, thanks')).toBeNull();
  });

  it('returns null once a space follows the shortcut', () => {
    expect(matchShortcutTrigger('Hi there, /ty ')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(matchShortcutTrigger('')).toBeNull();
  });
});

describe('applyShortcutTrigger', () => {
  it('replaces the trailing /shortcut with the canned body', () => {
    expect(applyShortcutTrigger('Hi there, /ty', 'Thank you for reaching out!')).toBe(
      'Hi there, Thank you for reaching out!',
    );
  });

  it('replaces a bare trailing /shortcut with no preceding text', () => {
    expect(applyShortcutTrigger('/refund', 'Your refund is being processed.')).toBe(
      'Your refund is being processed.',
    );
  });

  it('leaves text unchanged when there is no trigger to replace', () => {
    expect(applyShortcutTrigger('Hi there, thanks', 'Anything')).toBe('Hi there, thanks');
  });
});
