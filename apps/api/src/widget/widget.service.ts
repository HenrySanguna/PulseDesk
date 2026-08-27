import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@pulsedesk/db';
import { WIDGET_TOKEN_TTL } from './widget.constants.js';
import type { WidgetTokenPayload } from './widget-token.types.js';

export interface CreateConversationResult {
  conversationId: string;
  customerId: string;
  token: string;
}

@Injectable()
export class WidgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Creates or recovers the `Customer` behind `customerSessionId`, then
   * creates or recovers their most recent `Conversation`, and signs a JWT
   * scoped to that exact `conversationId`. */
  async createOrGetConversation(
    customerSessionId: string,
  ): Promise<CreateConversationResult> {
    const customer = await this.prisma.customer.upsert({
      where: { sessionId: customerSessionId },
      create: { sessionId: customerSessionId },
      update: {},
    });

    const existingConversation = await this.prisma.conversation.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });

    const conversation =
      existingConversation ??
      (await this.prisma.conversation.create({
        data: { customerId: customer.id },
      }));

    const payload: WidgetTokenPayload = {
      conversationId: conversation.id,
      customerId: customer.id,
    };
    const token = await this.jwt.signAsync(payload, {
      expiresIn: WIDGET_TOKEN_TTL,
    });

    return { conversationId: conversation.id, customerId: customer.id, token };
  }
}
