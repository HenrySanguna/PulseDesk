import 'dotenv/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '@pulsedesk/db';
import { CannedResponsesService } from './canned-responses.service.js';

/**
 * Real-Postgres integration tests for `CannedResponse` CRUD (tasks.md 1.1) —
 * the one piece of this batch with real backend logic (a unique-constraint
 * conflict Prisma error mapped to a domain exception), held to the same
 * integration-test bar as `00`-`05`.
 */
describe('CannedResponsesService (real Postgres)', () => {
  const prisma = new PrismaService();
  const service = new CannedResponsesService(prisma);
  const suffix = `cr-${Date.now()}`;
  const ids: string[] = [];

  afterAll(async () => {
    await prisma.cannedResponse.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('creates a canned response and lists it back ordered by shortcut', async () => {
    const zebra = await service.create({
      shortcut: `zzz-${suffix}`,
      title: 'Zebra',
      body: 'z body',
    });
    const alpha = await service.create({
      shortcut: `aaa-${suffix}`,
      title: 'Alpha',
      body: 'a body',
    });
    ids.push(zebra.id, alpha.id);

    const all = await service.list();
    const indexOfAlpha = all.findIndex((r) => r.id === alpha.id);
    const indexOfZebra = all.findIndex((r) => r.id === zebra.id);
    expect(indexOfAlpha).toBeGreaterThanOrEqual(0);
    expect(indexOfZebra).toBeGreaterThan(indexOfAlpha);
  });

  it('rejects creating a second canned response with an already-taken shortcut', async () => {
    const shortcut = `dup-${suffix}`;
    const first = await service.create({ shortcut, title: 'First', body: 'first' });
    ids.push(first.id);

    await expect(
      service.create({ shortcut, title: 'Second', body: 'second' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const persisted = await prisma.cannedResponse.findMany({ where: { shortcut } });
    expect(persisted).toHaveLength(1);
  });

  it('updates a canned response in place', async () => {
    const created = await service.create({
      shortcut: `upd-${suffix}`,
      title: 'Before',
      body: 'before body',
    });
    ids.push(created.id);

    const updated = await service.update(created.id, { title: 'After' });
    expect(updated.title).toBe('After');
    expect(updated.body).toBe('before body');
  });

  it('rejects updating a canned response to an already-taken shortcut', async () => {
    const a = await service.create({ shortcut: `upd-a-${suffix}`, title: 'A', body: 'a' });
    const b = await service.create({ shortcut: `upd-b-${suffix}`, title: 'B', body: 'b' });
    ids.push(a.id, b.id);

    await expect(
      service.update(b.id, { shortcut: `upd-a-${suffix}` }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException updating/deleting a canned response that does not exist', async () => {
    const missingId = crypto.randomUUID();
    await expect(
      service.update(missingId, { title: 'Whatever' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(missingId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a canned response', async () => {
    const created = await service.create({
      shortcut: `del-${suffix}`,
      title: 'To delete',
      body: 'gone soon',
    });

    await service.remove(created.id);

    const found = await prisma.cannedResponse.findUnique({ where: { id: created.id } });
    expect(found).toBeNull();
  });
});
