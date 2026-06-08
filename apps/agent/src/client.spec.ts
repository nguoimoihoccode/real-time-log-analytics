import { io } from 'socket.io-client';
import { AgentClient } from './client';

jest.mock('socket.io-client');

describe('AgentClient', () => {
  it('emits log events over Socket.IO while keeping public API', () => {
    const socket = { connected: true, emit: jest.fn(), on: jest.fn(), close: jest.fn() };
    jest.mocked(io).mockReturnValue(socket as never);
    const client = new AgentClient('http://localhost:3000');
    const event = { timestamp: new Date().toISOString(), level: 'info' as const, service: 'api', host: 'web-1', message: 'ok', metadata: {} };

    client.connect();
    client.send(event);
    client.close();

    expect(io).toHaveBeenCalledWith('http://localhost:3000', { transports: ['websocket'] });
    expect(socket.emit).toHaveBeenCalledWith('log', event);
    expect(socket.close).toHaveBeenCalled();
  });
});
