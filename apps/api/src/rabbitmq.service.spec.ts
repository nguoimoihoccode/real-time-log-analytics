import * as amqp from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';

jest.mock('amqplib');

describe('RabbitmqService', () => {
  it('connects, asserts durable raw queue with dlx, and publishes persistent JSON', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      sendToQueue: jest.fn().mockReturnValue(true),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.mocked(amqp.connect).mockResolvedValue(connection as never);
    const service = new RabbitmqService();
    const event = { timestamp: new Date().toISOString(), level: 'info' as const, service: 'api', host: 'web-1', message: 'ok', metadata: {} };

    await service.onModuleInit();
    service.publishLog(event);

    expect(amqp.connect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
    expect(channel.assertExchange).toHaveBeenCalledWith('logs.dlx', 'direct', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('logs.raw', { durable: true, deadLetterExchange: 'logs.dlx' });
    expect(channel.assertQueue).toHaveBeenCalledWith('logs.dlq', { durable: true });
    expect(channel.bindQueue).toHaveBeenCalledWith('logs.dlq', 'logs.dlx', 'logs.raw');
    expect(connection.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(connection.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(channel.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(channel.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(channel.sendToQueue).toHaveBeenCalledWith('logs.raw', Buffer.from(JSON.stringify(event)), {
      contentType: 'application/json',
      persistent: true,
    });
  });

  it('throws when sendToQueue reports backpressure', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      sendToQueue: jest.fn().mockReturnValue(false),
      on: jest.fn(),
    };
    const connection = { createChannel: jest.fn().mockResolvedValue(channel), on: jest.fn() };
    jest.mocked(amqp.connect).mockResolvedValue(connection as never);
    const service = new RabbitmqService();
    await service.onModuleInit();

    expect(() => service.publishLog({ timestamp: new Date().toISOString(), level: 'info', service: 'api', host: 'web-1', message: 'ok', metadata: {} })).toThrow('RabbitMQ backpressure');
  });
});
