import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';
import { CreateConversationDto } from './dto/create-conversation.dto.js';
import { WidgetTokenGuard } from './widget-token.guard.js';
import { WidgetService } from './widget.service.js';

@Controller('widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  /** No `WidgetTokenGuard` here by design — there is no token yet. Rate
   * limited per-IP to slow down conversation-creation abuse. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('conversations')
  async createConversation(
    @Body() dto: CreateConversationDto,
  ): Promise<{ conversationId: string; token: string }> {
    const { conversationId, token } =
      await this.widgetService.createOrGetConversation(dto.customerSessionId);
    return { conversationId, token };
  }

  @UseGuards(WidgetTokenGuard)
  @Get('conversations/:conversationId')
  getConversation(
    @Param('conversationId') conversationId: string,
  ): { conversationId: string } {
    return { conversationId };
  }
}
