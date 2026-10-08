import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaterialsService } from './materials.service';
import { RuntimeNotifier } from './runtime-notifier.service';

@Controller('admin/enterprises/:enterpriseId/materials')
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly notifier: RuntimeNotifier,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('enterpriseId') enterpriseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('缺少文件字段 file（multipart/form-data）');
    }
    const result = await this.materials.upload(enterpriseId, file.originalname, file.buffer);
    // 解析成功即作为「数据层代言的 system 对话」投递给推理层（异步，不阻塞上传响应）
    void this.notifier.notifyNewMaterial(enterpriseId, result);
    return result;
  }

  @Get()
  list(@Param('enterpriseId') enterpriseId: string) {
    return this.materials.list(enterpriseId);
  }

  @Get(':file')
  read(@Param('enterpriseId') enterpriseId: string, @Param('file') file: string) {
    return this.materials.read(enterpriseId, file);
  }
}
