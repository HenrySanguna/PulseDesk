import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { WsAuthContext } from './ws-auth.js';

interface WsResponseEnvelope {
  event: string;
  data: unknown;
}

/**
 * Conversation rooms (tasks.md 2.3): a hand-maintained
 * `Map<conversationId, Set<WebSocket>>` — there is no `.join()` primitive
 * with a raw `ws` server the way there is with Socket.IO (design.md "Salas:
 * un Map<conversationId, Set<WebSocket>> mantenido a mano"). Also tracks
 * which agent ids are present per room, for the presence indicator
 * (tasks.md 2.7).
 *
 * Enforces spec's "Aislamiento de salas de conversación": `broadcast` only
 * ever iterates the exact room `Set` for the given `conversationId`, so a
 * message sent in conversation A can structurally never reach a socket that
 * only ever joined conversation B.
 */
@Injectable()
export class ConversationRoomsService {
  private readonly rooms = new Map<string, Set<WebSocket>>();
  private readonly memberships = new WeakMap<WebSocket, Set<string>>();
  private readonly presence = new Map<string, Set<string>>();

  join(conversationId: string, client: WebSocket, auth: WsAuthContext): void {
    let room = this.rooms.get(conversationId);
    if (!room) {
      room = new Set();
      this.rooms.set(conversationId, room);
    }
    room.add(client);

    let joined = this.memberships.get(client);
    if (!joined) {
      joined = new Set();
      this.memberships.set(client, joined);
    }
    joined.add(conversationId);

    if (auth.kind === 'agent') {
      this.addPresence(conversationId, auth.agentId);
    }
  }

  leave(conversationId: string, client: WebSocket, auth: WsAuthContext): void {
    this.rooms.get(conversationId)?.delete(client);
    this.memberships.get(client)?.delete(conversationId);
    if (auth.kind === 'agent') {
      this.removePresence(conversationId, auth.agentId);
    }
  }

  /** Called on disconnect (tasks.md 2.4 "libera los recursos asociados a
   * esa sala") — removes `client` from every room it had joined, without
   * the caller needing to remember which ones. */
  leaveAll(client: WebSocket, auth: WsAuthContext): void {
    const joined = this.memberships.get(client);
    if (!joined) {
      return;
    }
    for (const conversationId of joined) {
      this.rooms.get(conversationId)?.delete(client);
      if (auth.kind === 'agent') {
        this.removePresence(conversationId, auth.agentId);
      }
    }
    this.memberships.delete(client);
  }

  /** Sends `envelope` to every socket in `conversationId`'s room, optionally
   * skipping `exclude` (the sender, for events like `typing` where echoing
   * back to the author is pointless). */
  broadcast(conversationId: string, envelope: WsResponseEnvelope, exclude?: WebSocket): void {
    const room = this.rooms.get(conversationId);
    if (!room) {
      return;
    }
    const message = JSON.stringify(envelope);
    for (const client of room) {
      if (client === exclude) {
        continue;
      }
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  }

  isMember(conversationId: string, client: WebSocket): boolean {
    return this.rooms.get(conversationId)?.has(client) ?? false;
  }

  presentAgentIds(conversationId: string): string[] {
    return Array.from(this.presence.get(conversationId) ?? []);
  }

  private addPresence(conversationId: string, agentId: string): void {
    let set = this.presence.get(conversationId);
    if (!set) {
      set = new Set();
      this.presence.set(conversationId, set);
    }
    set.add(agentId);
    this.broadcast(conversationId, {
      event: 'presence:update',
      data: { conversationId, agentIds: this.presentAgentIds(conversationId) },
    });
  }

  private removePresence(conversationId: string, agentId: string): void {
    const set = this.presence.get(conversationId);
    if (!set?.delete(agentId)) {
      return;
    }
    this.broadcast(conversationId, {
      event: 'presence:update',
      data: { conversationId, agentIds: this.presentAgentIds(conversationId) },
    });
  }
}
