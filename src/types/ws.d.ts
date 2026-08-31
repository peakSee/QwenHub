declare module 'ws' {
  import { EventEmitter } from 'events';
  import { Agent, ClientRequest, Server as HTTPServer, IncomingMessage } from 'http';
  import { Server as HTTPSServer } from 'https';
  import { Duplex, DuplexOptions } from 'stream';
  import { SecureContextOptions } from 'tls';
  import { ZlibOptions } from 'zlib';

  // WebSocket class
  class WebSocket extends EventEmitter {
    constructor(address: string | URL, options?: WebSocket.ClientOptions | WebSocket.ClientRequestArgs);
    constructor(address: string, protocols?: string | string[], options?: WebSocket.ClientOptions | WebSocket.ClientRequestArgs);

    binaryType: string;
    bufferedAmount: number;
    extensions: string;
    protocol: string;
    readyState: number;
    url: string;
    protocolVersion: number;

    close(code?: number, reason?: string): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: any, cb?: (err?: Error) => void): void;
    send(data: any, options: { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean }, cb?: (err?: Error) => void): void;
    terminate(): void;

    // EventEmitter methods
    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'close', listener: (code: number, reason: string) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: WebSocket.Data, isBinary: boolean) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping', listener: (data: Buffer) => void): this;
    on(event: 'pong', listener: (data: Buffer) => void): this;
    on(event: 'unexpected-response', listener: (req: ClientRequest, res: IncomingMessage) => void): this;

    once(event: string, listener: (...args: any[]) => void): this;
    once(event: 'close', listener: (code: number, reason: string) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'message', listener: (data: WebSocket.Data, isBinary: boolean) => void): this;
    once(event: 'open', listener: () => void): this;

    off(event: string, listener: (...args: any[]) => void): this;

    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
  }

  namespace WebSocket {
    type Data = string | Buffer | ArrayBuffer | Buffer[];
    type Protocol = string | { [key: string]: string };

    interface ClientOptions {
      agent?: Agent;
      headers?: { [key: string]: string };
      protocol?: string | string[];
      followRedirects?: boolean;
      handshakeTimeout?: number;
      maxPayload?: number;
      perMessageDeflate?: boolean | ZlibOptions;
      origin?: string;
    }

    interface ClientRequestArgs {
      host?: string;
      hostname?: string;
      port?: number;
      path?: string;
      headers?: { [key: string]: string };
      agent?: Agent;
      protocol?: string;
      perMessageDeflate?: boolean | ZlibOptions;
    }

    interface ServerOptions {
      port?: number;
      host?: string;
      server?: HTTPServer | HTTPSServer;
      noServer?: boolean;
      path?: string;
      perMessageDeflate?: boolean | ZlibSizeOptions;
      clientTracking?: boolean;
    }

    interface WebSocketServer extends EventEmitter {
      options: ServerOptions;
      path: string;
      clients: Set<WebSocket>;
      close(cb?: (err?: Error) => void): void;
      handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, cb: (ws: WebSocket, request: IncomingMessage) => void): void;
      shouldHandle(request: IncomingMessage): boolean | Promise<boolean>;
      on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage) => void): this;
      on(event: 'error', listener: (err: Error) => void): this;
      on(event: 'listening', listener: () => void): this;
      on(event: 'headers', listener: (headers: string[], request: IncomingMessage) => void): this;
    }

    interface ZlibSizeOptions extends ZlibOptions {
      threshold?: number;
    }

    class WebSocketServer {
      constructor(options?: ServerOptions, callback?: () => void);
      options: ServerOptions;
      path: string;
      clients: Set<WebSocket>;
      close(cb?: (err?: Error) => void): void;
      handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, cb: (ws: WebSocket, request: IncomingMessage) => void): void;
      shouldHandle(request: IncomingMessage): boolean | Promise<boolean>;
      on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage) => void): this;
      on(event: 'error', listener: (err: Error) => void): this;
      on(event: 'listening', listener: () => void): this;
    }

    class Receiver extends EventEmitter {
      constructor(options?: { maxPayload?: number; mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean });
      add(data: Buffer): void;
    }

    class Sender {
      constructor(socket: Duplex, options?: { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean });
      send(data: any, cb?: (err?: Error) => void): void;
      send(data: any, options: { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean }, cb?: (err?: Error) => void): void;
      close(code?: number, reason?: string, cb?: (err?: Error) => void): void;
      ping(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
      pong(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
    }
  }

  export = WebSocket;
}
