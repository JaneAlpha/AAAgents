import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module';
import { AutonomyModule } from './autonomy/autonomy.module';
import { OutputModule } from './output/output.module';

@Module({
  imports: [OutputModule, AgentModule, AutonomyModule],
})
export class AppModule {}
