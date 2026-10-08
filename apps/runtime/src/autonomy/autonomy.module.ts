import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AutonomyService } from './autonomy.service';

@Module({
  imports: [AgentModule],
  providers: [AutonomyService],
})
export class AutonomyModule {}
