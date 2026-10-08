import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<{ enterprise_id: string }> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }
    const enterpriseId = `ent_${randomUUID()}`;
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.enterprise.create({
      data: {
        enterpriseId,
        name: dto.enterprise_name,
        variety: dto.variety,
        users: {
          create: { username: dto.username, passwordHash },
        },
      },
    });

    return { enterprise_id: enterpriseId };
  }

  async login(dto: LoginDto): Promise<{ enterprise_id: string }> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return { enterprise_id: user.enterpriseId };
  }
}
