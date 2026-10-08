import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** 某企业的会话列表（按最近更新倒序）。 */
  @Get()
  list(@Query('enterprise_id') enterpriseId: string) {
    return this.sessions.list(enterpriseId);
  }

  /** 读取某会话的全部消息，用于历史展示与续接。 */
  @Get(':enterpriseId/:sessionId')
  get(@Param('enterpriseId') enterpriseId: string, @Param('sessionId') sessionId: string) {
    return this.sessions.get(enterpriseId, sessionId);
  }

  @Delete(':enterpriseId/:sessionId')
  remove(@Param('enterpriseId') enterpriseId: string, @Param('sessionId') sessionId: string) {
    return this.sessions.remove(enterpriseId, sessionId);
  }
}
