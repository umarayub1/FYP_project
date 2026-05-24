// Client-only: do not import in server components or server actions.
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// NEXT_PUBLIC_GATEWAY_URL is the API base (e.g. http://localhost:4000/api).
// Socket.IO connects to the root of the same origin, so strip /api before
// using it as the connection URL — otherwise socket.io-client treats /api
// as a namespace and the handshake never lands on the configured server.
function getOrigin(): string {
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';
  try {
    const url = new URL(base);
    return `${url.protocol}//${url.host}`;
  } catch {
    return base;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getOrigin(), {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function joinDoc(docId: string): void {
  getSocket().emit('join:doc', docId);
}

export function leaveDoc(docId: string): void {
  getSocket().emit('leave:doc', docId);
}
