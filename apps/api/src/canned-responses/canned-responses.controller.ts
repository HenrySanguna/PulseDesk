import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CannedResponse } from '@pulsedesk/db';
import { AgentSessionGuard } from '../auth/agent-session.guard.js';
import { CannedResponsesService } from './canned-responses.service.js';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto.js';
import { UpdateCannedResponseDto } from './dto/update-canned-response.dto.js';

/** Agent-only tool (tasks.md 1.1/1.2) — no widget/customer access, unlike
 * `TicketsController`'s dual-access routes. */
@UseGuards(AgentSessionGuard)
@Controller('canned-responses')
export class CannedResponsesController {
  constructor(private readonly cannedResponses: CannedResponsesService) {}

  @Get()
  list(): Promise<CannedResponse[]> {
    return this.cannedResponses.list();
  }

  @Post()
  create(@Body() dto: CreateCannedResponseDto): Promise<CannedResponse> {
    return this.cannedResponses.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCannedResponseDto,
  ): Promise<CannedResponse> {
    return this.cannedResponses.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.cannedResponses.remove(id);
  }
}
