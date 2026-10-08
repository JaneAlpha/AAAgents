import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

function makePrisma() {
  return {
    user: { findUnique: jest.fn(), create: jest.fn() },
    enterprise: { create: jest.fn() },
  } as any;
}

describe('AuthService', () => {
  it('注册：用户名已占用 → ConflictException', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    const svc = new AuthService(prisma);

    await expect(
      svc.register({ username: 'a', password: 'secret1', enterprise_name: 'E', variety: '苹果' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('注册：成功写入企业+用户并返回 enterprise_id', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.enterprise.create.mockImplementation(async (args: any) => args);
    const svc = new AuthService(prisma);

    const res = await svc.register({
      username: 'newuser',
      password: 'secret1',
      enterprise_name: '新企业',
      variety: '红枣',
    });

    expect(res.enterprise_id).toMatch(/^ent_/);
    const createArg = prisma.enterprise.create.mock.calls[0][0];
    expect(createArg.data.variety).toBe('红枣');
    expect(createArg.data.enterpriseId).toBe(res.enterprise_id);
    // 密码必须是哈希，不能是明文
    const hash = createArg.data.users.create.passwordHash;
    expect(hash).not.toBe('secret1');
    expect(await bcrypt.compare('secret1', hash)).toBe(true);
  });

  it('登录：用户不存在 → UnauthorizedException', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const svc = new AuthService(prisma);

    await expect(svc.login({ username: 'x', password: 'y' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('登录：密码错误 → UnauthorizedException', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      username: 'x',
      passwordHash: await bcrypt.hash('correct', 4),
      enterpriseId: 'ent_1',
    });
    const svc = new AuthService(prisma);

    await expect(svc.login({ username: 'x', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('登录：成功返回 enterprise_id', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      username: 'x',
      passwordHash: await bcrypt.hash('correct', 4),
      enterpriseId: 'ent_1',
    });
    const svc = new AuthService(prisma);

    await expect(svc.login({ username: 'x', password: 'correct' })).resolves.toEqual({
      enterprise_id: 'ent_1',
    });
  });
});
