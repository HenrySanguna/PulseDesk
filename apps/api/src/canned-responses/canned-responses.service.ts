import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CannedResponse } from '@pulsedesk/db';
import { Prisma, PrismaService } from '@pulsedesk/db';
import type { CreateCannedResponseDto } from './dto/create-canned-response.dto.js';
import type { UpdateCannedResponseDto } from './dto/update-canned-response.dto.js';

/**
 * Plain CRUD over `CannedResponse` (tasks.md 1.1) — flat, shared library, no
 * per-agent ownership. `shortcut` is `@unique` in Postgres; both `create`
 * and `update` translate the resulting `P2002` into a domain-meaningful
 * `ConflictException` instead of leaking the raw Prisma error, same pattern
 * `WidgetMessagingService.sendMessage` uses for its own unique-constraint
 * conflict.
 */
@Injectable()
export class CannedResponsesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Ordered by `shortcut` — the natural order for a list an agent scans
   * for the trigger they're about to type. */
  async list(): Promise<CannedResponse[]> {
    return this.prisma.cannedResponse.findMany({ orderBy: { shortcut: 'asc' } });
  }

  async create(dto: CreateCannedResponseDto): Promise<CannedResponse> {
    try {
      return await this.prisma.cannedResponse.create({ data: dto });
    } catch (err) {
      this.mapConflict(err, dto.shortcut);
    }
  }

  async update(id: string, dto: UpdateCannedResponseDto): Promise<CannedResponse> {
    try {
      return await this.prisma.cannedResponse.update({ where: { id }, data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('CANNED_RESPONSE_NOT_FOUND');
      }
      this.mapConflict(err, dto.shortcut);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.cannedResponse.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('CANNED_RESPONSE_NOT_FOUND');
      }
      throw err;
    }
  }

  /** Always throws — either the domain-meaningful conflict or the original
   * error, never returns. `never` lets both call sites above type-check
   * without an unreachable `return`/`throw` after calling this. */
  private mapConflict(err: unknown, shortcut: string | undefined): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException(
        `CANNED_RESPONSE_SHORTCUT_TAKEN: ${shortcut ?? ''}`,
      );
    }
    throw err;
  }
}
