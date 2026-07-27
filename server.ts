import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const HOST = '0.0.0.0';

interface RoomState {
  code: string;
  senderId?: string;
  receiverIds: string[];
  createdAt: number;
  deleteTimer?: NodeJS.Timeout;
}

const rooms = new Map<string, RoomState>();

/**
 * Générateur de code de salle aléatoire de 6 caractères
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e6, // Seul le signalement passe par ici, pas de données de fichiers !
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  // Endpoints API
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Gestion de la signalisation WebRTC via Socket.IO
  io.on('connection', (socket) => {
    let currentRoom: string | null = null;
    let userRole: 'sender' | 'receiver' | null = null;

    // Création d'une nouvelle salle
    socket.on('create-room', (callback) => {
      let code = generateRoomCode();
      while (rooms.has(code)) {
        code = generateRoomCode();
      }

      const room: RoomState = {
        code,
        senderId: socket.id,
        receiverIds: [],
        createdAt: Date.now(),
      };

      rooms.set(code, room);
      socket.join(code);
      currentRoom = code;
      userRole = 'sender';

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: code });
      } else {
        socket.emit('room-created', { roomCode: code });
      }
    });

    // Rejoint ou réintègre une salle existante
    socket.on('join-room', ({ roomCode, role }, callback) => {
      const formattedCode = (roomCode || '').toUpperCase().trim();
      const room = rooms.get(formattedCode);

      if (!room) {
        const errorMsg = 'Code de salle introuvable ou expiré.';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMsg });
        } else {
          socket.emit('room-error', { message: errorMsg });
        }
        return;
      }

      // Annuler le minuteur de suppression de salle en cas de reconnexion
      if (room.deleteTimer) {
        clearTimeout(room.deleteTimer);
        room.deleteTimer = undefined;
      }

      socket.join(formattedCode);
      currentRoom = formattedCode;

      if (role === 'sender') {
        userRole = 'sender';
        room.senderId = socket.id;
      } else {
        userRole = 'receiver';
        if (!room.receiverIds.includes(socket.id)) {
          room.receiverIds.push(socket.id);
        }
      }

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: formattedCode });
      } else {
        socket.emit('room-joined', { roomCode: formattedCode });
      }

      // Notifier les pairs de la présence/reconnexion
      socket.to(formattedCode).emit('peer-joined', { peerId: socket.id, role: userRole });
    });

    // Relayement des offres SDP WebRTC
    socket.on('offer', ({ target, offer }) => {
      if (target) {
        io.to(target).emit('offer', { sender: socket.id, offer });
      } else if (currentRoom) {
        socket.to(currentRoom).emit('offer', { sender: socket.id, offer });
      }
    });

    // Relayement des réponses SDP WebRTC
    socket.on('answer', ({ target, answer }) => {
      if (target) {
        io.to(target).emit('answer', { sender: socket.id, answer });
      } else if (currentRoom) {
        socket.to(currentRoom).emit('answer', { sender: socket.id, answer });
      }
    });

    // Relayement des candidats ICE
    socket.on('ice-candidate', ({ target, candidate }) => {
      if (target) {
        io.to(target).emit('ice-candidate', { sender: socket.id, candidate });
      } else if (currentRoom) {
        socket.to(currentRoom).emit('ice-candidate', { sender: socket.id, candidate });
      }
    });

    // Demande de redémarrage ICE (Reconnexion WebRTC)
    socket.on('ice-restart', ({ target }) => {
      if (target) {
        io.to(target).emit('ice-restart', { sender: socket.id });
      } else if (currentRoom) {
        socket.to(currentRoom).emit('ice-restart', { sender: socket.id });
      }
    });

    // Réinitialisation de session
    socket.on('session-reset', () => {
      if (currentRoom) {
        socket.to(currentRoom).emit('session-reset');
      }
    });

    // Déconnexion avec délai de grâce (Rétention de la salle pendant 15 minutes)
    socket.on('disconnect', () => {
      if (currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          if (room.senderId === socket.id) {
            socket.to(currentRoom).emit('peer-disconnected', { role: 'sender', peerId: socket.id });
            room.senderId = undefined;
          } else {
            room.receiverIds = room.receiverIds.filter((id) => id !== socket.id);
            socket.to(currentRoom).emit('peer-disconnected', { role: 'receiver', peerId: socket.id });
          }

          // Si la salle devient complètement vide, lui accorder un délai de grâce de 15 minutes avant suppression
          if (!room.senderId && room.receiverIds.length === 0) {
            if (room.deleteTimer) clearTimeout(room.deleteTimer);
            room.deleteTimer = setTimeout(() => {
              rooms.delete(currentRoom!);
            }, 15 * 60 * 1000); // 15 minutes de répit
          }
        }
      }
    });
  });

  // Nettoyage automatique des salles inactives (> 24h)
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (now - room.createdAt > 24 * 3600 * 1000) {
        rooms.delete(code);
      }
    }
  }, 3600 * 1000);

  // Configuration du middleware Vite (Développement vs Production)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[P2P Server] Serveur de signalement démarré sur http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[P2P Server] Erreur lors du démarrage du serveur:', err);
});
