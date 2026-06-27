import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';

let io: SocketServer;

export function initSocket(server: HttpServer) {
  io = new SocketServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    // Supervisor/trainer joins a room to watch a session
    socket.on('watch:session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });

    // Athlete joins their own session room
    socket.on('join:session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

export function emitMeasurement(sessionId: string, data: { bar_cm: number; weight_kg: number; recorded_at: string }) {
  if (io) io.to(`session:${sessionId}`).emit('measurement', data);
}

export function emitSessionStatus(sessionId: string, status: 'active' | 'completed') {
  if (io) io.to(`session:${sessionId}`).emit('session:status', { status });
}

export function getIo() { return io; }
