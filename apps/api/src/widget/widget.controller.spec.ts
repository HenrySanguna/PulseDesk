import { describe, expect, it, vi } from 'vitest';
import { WidgetController } from './widget.controller.js';
import type { WidgetService } from './widget.service.js';

describe('WidgetController.createConversation', () => {
  it('delegates to WidgetService and returns only conversationId and token', async () => {
    const widgetService = {
      createOrGetConversation: vi.fn(() =>
        Promise.resolve({
          conversationId: 'conversation-1',
          customerId: 'customer-1',
          token: 'signed-jwt-value',
        }),
      ),
    } as unknown as WidgetService;
    const controller = new WidgetController(widgetService);

    const response = await controller.createConversation({
      customerSessionId: 'widget-session-1',
    });

    expect(widgetService.createOrGetConversation).toHaveBeenCalledWith(
      'widget-session-1',
    );
    expect(response).toEqual({
      conversationId: 'conversation-1',
      token: 'signed-jwt-value',
    });
  });
});

describe('WidgetController.getConversation', () => {
  it('echoes back the requested conversationId', () => {
    const widgetService = {} as WidgetService;
    const controller = new WidgetController(widgetService);

    expect(controller.getConversation('conversation-1')).toEqual({
      conversationId: 'conversation-1',
    });
  });
});
