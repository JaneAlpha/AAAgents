import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DistributionModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
