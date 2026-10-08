import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Response } from 'express';
import { AgentService } from './agent.service';

class RunDto {
  @IsString()
  @IsNotEmpty()
  enterprise_id!: string;

  @IsString()
  @IsNotEmpty()
  user_request!: string;

  @IsOptional()
  @IsString()
  session_id?: string;
}

class ChatDto {
  @IsString()
  @IsNotEmpty()
  enterprise_id!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsIn(['user', 'system'])
  author?: 'user' | 'system';
}

class IngestDto {
  @IsString()
  @IsNotEmpty()
  enterprise_id!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  material_name?: string;
}

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('health')
  async health() {
    const config = await this.agent.getConfig();
    return { status: 'ok', model: config.model, configured: !!(config.base_url && config.api_key) };
  }

  @Post('run')
  run(@Body() dto: RunDto) {
    return this.agent.run(dto);
  }

  /** 统一对话入口（用户对话）。 */
  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.agent.chat(dto);
  }

  /** 对话流式（SSE）：event: start|token|memory|result|error */
  @Post('chat/stream')
  async chatStream(@Body() dto: ChatDto, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    try {
      for await (const ev of this.agent.chatStream(dto)) {
        res.write(`event: ${ev.type}\n`);
        res.write(`data: ${JSON.stringify(ev.data)}\n\n`);
      }
    } catch (err) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  }

  /** 数据层投递入口：把「新增资料」作为 system 作者的一轮对话。 */
  @Post('ingest')
  ingest(@Body() dto: IngestDto) {
    return this.agent.chat({
      enterprise_id: dto.enterprise_id,
      message: dto.message,
      author: 'system',
    });
  }

  /** SSE 流式：event: start|token|attempt|result|error */
  @Post('stream')
  async stream(@Body() dto: RunDto, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();

    try {
      for await (const ev of this.agent.stream(dto)) {
        res.write(`event: ${ev.type}\n`);
        res.write(`data: ${JSON.stringify(ev.data)}\n\n`);
      }
    } catch (err) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
