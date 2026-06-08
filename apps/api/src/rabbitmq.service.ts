import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { LogEvent } from '@rtla/shared';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private connection?: Awaited<ReturnType<typeof amqp.connect>>;
  private channel?: amqp.Channel;
  private readonly url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

  async onModuleInit(): Promise<void> {
    const connection = await amqp.connect(this.url);
    const channel = await connection.createChannel();
    connection.on('error', () => undefined);
    connection.on('close', () => undefined);
    channel.on('error', () => undefined);
    channel.on('close', () => undefined);

    await channel.assertExchange('logs.dlx', 'direct', { durable: true });
    await channel.assertQueue('logs.raw', { durable: true, deadLetterExchange: 'logs.dlx' });
    await channel.assertQueue('logs.dlq', { durable: true });
    await channel.bindQueue('logs.dlq', 'logs.dlx', 'logs.raw');
    this.connection = connection;
    this.channel = channel;
  }

  publishLog(event: LogEvent): void {
    if (!this.channel) throw new Error('RabbitMQ channel is not initialized');
    const sent = this.channel.sendToQueue('logs.raw', Buffer.from(JSON.stringify(event)), {
      contentType: 'application/json',
      persistent: true,
    });
    if (!sent) throw new Error('RabbitMQ backpressure');
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
