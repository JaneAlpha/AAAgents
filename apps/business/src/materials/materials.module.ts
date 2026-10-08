import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { RuntimeNotifier } from './runtime-notifier.service';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService, RuntimeNotifier],
})
export class MaterialsModule {}
