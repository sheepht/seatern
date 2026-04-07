/**
 * Auth utils tests
 *
 * 測試 ensureUser 函式的使用者查找/建立邏輯。
 * verifyToken 依賴外部 JWKS，此處不測試。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@seatern/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock jose to prevent JWKS initialization
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(),
}));

import { prisma } from '@seatern/db';
import { ensureUser } from '../lib/auth-utils';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureUser', () => {
  it('缺少 sub claim → 拋出錯誤', async () => {
    await expect(ensureUser({ email: 'test@test.com' })).rejects.toThrow('missing sub claim');
  });

  it('用 ID 找到使用者 → 更新 name/avatar，回傳 userId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Old Name',
      avatarUrl: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof prisma.user.findUnique> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as ReturnType<typeof prisma.user.update> extends Promise<infer T> ? T : never);

    const result = await ensureUser({
      sub: 'user-1',
      email: 'test@test.com',
      user_metadata: { full_name: 'New Name', avatar_url: 'https://avatar.url' },
    });

    expect(result).toBe('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name', avatarUrl: 'https://avatar.url' },
    });
  });

  it('使用者已刪除 (deletedAt 已設定) → 拋出 Account deleted', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Deleted User',
      avatarUrl: null,
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof prisma.user.findUnique> extends Promise<infer T> ? T : never);

    await expect(
      ensureUser({ sub: 'user-1', email: 'test@test.com' }),
    ).rejects.toThrow('Account deleted');
  });

  it('ID 找不到但 email 找到 → 更新 ID 為新的', async () => {
    // First call (by id) returns null, second call (by email) returns user
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'old-id',
        email: 'test@test.com',
        name: 'Existing',
        avatarUrl: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ReturnType<typeof prisma.user.findUnique> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as ReturnType<typeof prisma.user.update> extends Promise<infer T> ? T : never);

    const result = await ensureUser({
      sub: 'new-id',
      email: 'test@test.com',
      user_metadata: { name: 'Updated Name' },
    });

    expect(result).toBe('new-id');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: 'test@test.com' },
      data: { id: 'new-id', name: 'Updated Name', avatarUrl: undefined },
    });
  });

  it('ID 和 email 都找不到 → 建立新使用者', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValue({} as ReturnType<typeof prisma.user.create> extends Promise<infer T> ? T : never);

    const result = await ensureUser({
      sub: 'brand-new',
      email: 'new@test.com',
      user_metadata: { full_name: 'Brand New User' },
    });

    expect(result).toBe('brand-new');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        id: 'brand-new',
        email: 'new@test.com',
        name: 'Brand New User',
        avatarUrl: undefined,
      },
    });
  });
});
