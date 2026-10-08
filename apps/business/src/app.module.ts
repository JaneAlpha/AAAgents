import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MaterialsModule } from './materials/materials.module';
import { SessionsModule } from './sessions/sessions.module';
import { SkillModule } from './skill/skill.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkspaceModule,
    AdminModule,
    SkillModule,
    MaterialsModule,
    SessionsModule,
    // 配套前端（React 构建产物）通过 /admin 静态托管；目录不存在时静默跳过。
    ServeStaticModule.forRoot({
      rootPath: process.env.ADMIN_WEB_ROOT || join(__dirname, '..', 'public'),
      serveRoot: '/admin',
      serveStaticOptions: { fallthrough: true },
    }),
  ],
})
export class AppModule {}
