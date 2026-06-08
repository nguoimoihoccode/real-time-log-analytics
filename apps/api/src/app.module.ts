import { Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { IngestionGateway } from './ingestion.gateway';
import { LogsController } from './logs.controller';
import { RabbitmqService } from './rabbitmq.service';

@Module({ controllers: [LogsController], providers: [RabbitmqService, IngestionGateway, ElasticsearchService] })
export class AppModule {}
