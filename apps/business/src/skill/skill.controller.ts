import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { SkillService } from './skill.service';

class UploadSkillDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  content!: string;
}

@Controller('skill')
export class SkillController {
  constructor(private readonly skill: SkillService) {}

  @Get(':enterpriseId')
  overview(@Param('enterpriseId') enterpriseId: string) {
    return this.skill.overview(enterpriseId);
  }

  @Post(':enterpriseId/:variety')
  upload(
    @Param('enterpriseId') enterpriseId: string,
    @Param('variety') variety: string,
    @Body() dto: UploadSkillDto,
  ) {
    return this.skill.upload(enterpriseId, variety, dto.filename, dto.content);
  }

  @Get(':enterpriseId/:variety/:filename')
  read(
    @Param('enterpriseId') enterpriseId: string,
    @Param('variety') variety: string,
    @Param('filename') filename: string,
  ) {
    return this.skill.read(enterpriseId, variety, filename);
  }
}
