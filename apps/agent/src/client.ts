import { io, type Socket } from 'socket.io-client';
import type { LogEvent } from '@rtla/shared';

export class AgentClient {
  private socket?: Socket;
  private buffer: LogEvent[] = [];
  private reconnectMs = 1000;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(private readonly url: string, private readonly maxBuffer = 1000) {}

  connect(): void {
    this.stopped = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.socket = io(this.url, { transports: ['websocket'] });
    this.socket.on('connect', () => {
      this.reconnectMs = 1000;
      this.flush();
    });
    this.socket.on('disconnect', () => this.scheduleReconnect());
    this.socket.on('connect_error', () => this.socket?.close());
  }

  send(event: LogEvent): void {
    if (this.socket?.connected) {
      this.socket.emit('log', event);
      return;
    }

    this.enqueue(event);
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.socket?.close();
    this.socket = undefined;
  }

  private enqueue(event: LogEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
  }

  private flush(): void {
    const pending = this.buffer.splice(0);
    for (const event of pending) this.send(event);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, 30000);
  }
}
