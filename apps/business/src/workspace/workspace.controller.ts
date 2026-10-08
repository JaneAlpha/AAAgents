import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { WorkspaceService } from './workspace.service';

class InitDto {
  @IsString()
  @IsNotEmpty()
  enterprise_id!: string;
}

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Post('init')
  init(@Body() dto: InitDto) {
    return this.workspace.init(dto.enterprise_id);
  }
}
