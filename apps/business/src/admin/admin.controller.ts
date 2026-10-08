import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { VARIETIES } from '../auth/dto';
import { AdminService } from './admin.service';

class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(VARIETIES as unknown as string[])
  variety!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

class UpdateEnterpriseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(VARIETIES as unknown as string[])
  variety?: string;
}

class PutDocumentDto {
  @IsString()
  content!: string;
}

class LlmConfigDto {
  @IsOptional()
  @IsString()
  base_url?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  api_key?: string;
}

class CreateQuoteDto {
  @IsIn(VARIETIES as unknown as string[])
  variety!: string;

  @IsString()
  @IsNotEmpty()
  contract!: string;

  @IsNumber()
  settle!: number;

  @IsInt()
  volume!: number;

  @IsInt()
  open_interest!: number;

  @IsString()
  quote_date!: string;

  @IsString()
  source!: string;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ---- 企业信息（首屏） ----
  @Get('enterprises')
  listEnterprises() {
    return this.admin.listEnterprises();
  }

  @Get('enterprises/:enterpriseId')
  getEnterprise(@Param('enterpriseId') enterpriseId: string) {
    return this.admin.getEnterprise(enterpriseId);
  }

  @Post('enterprises')
  createEnterprise(@Body() dto: CreateEnterpriseDto) {
    return this.admin.createEnterprise(dto);
  }

  @Patch('enterprises/:enterpriseId')
  updateEnterprise(@Param('enterpriseId') enterpriseId: string, @Body() dto: UpdateEnterpriseDto) {
    return this.admin.updateEnterprise(enterpriseId, dto);
  }

  @Delete('enterprises/:enterpriseId')
  deleteEnterprise(@Param('enterpriseId') enterpriseId: string) {
    return this.admin.deleteEnterprise(enterpriseId);
  }

  // ---- 文档类数据 ----
  @Get('enterprises/:enterpriseId/documents/:name')
  getDocument(@Param('enterpriseId') enterpriseId: string, @Param('name') name: string) {
    return this.admin.getDocument(enterpriseId, name);
  }

  @Put('enterprises/:enterpriseId/documents/:name')
  putDocument(
    @Param('enterpriseId') enterpriseId: string,
    @Param('name') name: string,
    @Body() dto: PutDocumentDto,
  ) {
    return this.admin.putDocument(enterpriseId, name, dto.content);
  }

  // ---- 行情 ----
  @Get('market-quotes')
  listQuotes(@Query('variety') variety?: string) {
    return this.admin.listQuotes(variety);
  }

  @Post('market-quotes')
  createQuote(@Body() dto: CreateQuoteDto) {
    return this.admin.createQuote(dto);
  }

  // ---- LLM 网关配置 ----
  @Get('llm-config')
  getLlmConfig() {
    return this.admin.getLlmConfig();
  }

  @Put('llm-config')
  putLlmConfig(@Body() dto: LlmConfigDto) {
    return this.admin.putLlmConfig(dto);
  }

  // ---- 系统级分品种资料 ----
  @Get('reference')
  listReference() {
    return this.admin.listReference();
  }

  /** 规则更新后，重分发到该品种的全部企业工作区。 */
  @Post('reference/redeploy')
  redeployReference(@Body() dto: { variety: string }) {
    return this.admin.redeployReference(dto.variety);
  }

  @Get('reference/:variety/:file')
  getReference(@Param('variety') variety: string, @Param('file') file: string) {
    return this.admin.getReference(variety, file);
  }
}
