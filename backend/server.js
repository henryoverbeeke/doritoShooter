const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const {
  createInitialState, movePlayer, shoot, shootLaser, updateBullets,
  triggerAirstrike, updateAirstrikes, updateLasers, updateAI, createPlayer,
} = require('./game-engine');

const { IS_DEV_MODE, ENABLE_AI_IN_DEV, PORT: CONFIG_PORT } = require('./config');

const PORT = CONFIG_PORT;
const TICK_RATE = 30;
const TICK_INTERVAL = 1000 / TICK_RATE;
const STATIC_DIR = path.join(__dirname, 'public');
const DEV_MODE = IS_DEV_MODE;

const CORNER_NAMES = ['Top-Left', 'Top-Right', 'Bottom-Center'];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

// ── Room management ──────────────────────────────────────────────────

const rooms = new Map();

function createRoom() {
  const roomId = uuidv4().slice(0, 6).toUpperCase();
  const room = {
    id: roomId,
    slots: [null, null, null],
    clients: new Map(),
    aiPlayers: new Set(), // Track which slots are AI players
    state: null,
    tickTimer: null,
    phase: 'lobby',
  };
  rooms.set(roomId, room);
  return room;
}

function broadcastToRoom(room, msg) {
  const data = JSON.stringify(msg);
  for (const [, client] of room.clients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function sendTo(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function lobbyState(room) {
  return {
    type: 'lobby_state',
    roomId: room.id,
    slots: room.slots.map((pid, i) => {
      if (!pid) return { slot: i, corner: CORNER_NAMES[i], taken: false, playerName: null };
      if (room.aiPlayers.has(i)) {
        return { slot: i, corner: CORNER_NAMES[i], taken: true, playerName: 'AI Player' };
      }
      const client = room.clients.get(pid);
      return { slot: i, corner: CORNER_NAMES[i], taken: true, playerName: client?.name || 'Player' };
    }),
    phase: room.phase,
  };
}

function startGame(room) {
  const occupiedSlots = room.slots
    .map((pid, i) => (pid ? i : -1))
    .filter((i) => i >= 0);

  // In dev mode, fill empty slots with AI players
  if (DEV_MODE && ENABLE_AI_IN_DEV) {
    const allSlots = [0, 1, 2];
    const emptySlots = allSlots.filter(i => !occupiedSlots.includes(i));
    
    // Fill empty slots with AI (need at least 2 players total)
    if (occupiedSlots.length === 1 && emptySlots.length > 0) {
      // Add one AI player if only one human player
      const aiSlot = emptySlots[0];
      room.slots[aiSlot] = 'AI_' + aiSlot; // Use special ID for AI
      room.aiPlayers.add(aiSlot);
      occupiedSlots.push(aiSlot);
      console.log(`🤖 Added AI player to slot ${aiSlot} in dev mode`);
    } else if (occupiedSlots.length === 0 && emptySlots.length >= 2) {
      // If no players, add 2 AI players for testing
      const aiSlot1 = emptySlots[0];
      const aiSlot2 = emptySlots[1];
      room.slots[aiSlot1] = 'AI_' + aiSlot1;
      room.slots[aiSlot2] = 'AI_' + aiSlot2;
      room.aiPlayers.add(aiSlot1);
      room.aiPlayers.add(aiSlot2);
      occupiedSlots.push(aiSlot1, aiSlot2);
      console.log(`🤖 Added 2 AI players for testing in dev mode`);
    }
  }

  room.state = createInitialState(occupiedSlots);
  room.phase = 'playing';

  broadcastToRoom(room, { type: 'game_start', state: room.state });

  room.tickTimer = setInterval(() => gameTick(room), TICK_INTERVAL);
}

function gameTick(room) {
  if (room.phase !== 'playing') return;
  const now = Date.now();

  // Handle human player inputs
  for (const [, client] of room.clients) {
    const player = room.state.players.find((p) => p.id === client.slot);
    if (!player || !player.alive) continue;

    const input = client.currentInput || {};
    const forward = (input.forward || 0);
    const rotate = (input.rotate || 0);
    movePlayer(player, forward, rotate, room.state.obstacles);

    if (input.shoot) {
      if (player.godMode) {
        const laser = shootLaser(player, room.state, now);
        if (laser) room.state.lasers.push(laser);
      } else {
        const bullet = shoot(player, now);
        if (bullet) room.state.bullets.push(bullet);
      }
    }
  }

  // Handle AI players
  for (const aiSlot of room.aiPlayers) {
    const player = room.state.players.find((p) => p.id === aiSlot);
    if (player && player.alive) {
      updateAI(player, room.state, now);
    }
  }

  updateBullets(room.state);
  updateAirstrikes(room.state);
  updateLasers(room.state);

  broadcastToRoom(room, { type: 'state_update', state: room.state });

  if (room.state.gameOver) {
    clearInterval(room.tickTimer);
    room.phase = 'ended';
    broadcastToRoom(room, {
      type: 'game_over',
      winner: room.state.winner,
    });
  }
}

function removePlayerFromRoom(room, playerId) {
  const client = room.clients.get(playerId);
  if (!client) return;

  if (client.slot !== null && client.slot !== undefined) {
    room.slots[client.slot] = null;
  }
  room.clients.delete(playerId);

  if (room.phase === 'lobby') {
    broadcastToRoom(room, lobbyState(room));
  }

  if (room.phase === 'playing') {
    const player = room.state?.players.find((p) => p.id === client.slot);
    if (player) {
      player.alive = false;
      player.hp = 0;
    }
  }

  if (room.clients.size === 0) {
    if (room.tickTimer) clearInterval(room.tickTimer);
    rooms.delete(room.id);
    console.log(`Room ${room.id} destroyed (empty)`);
  }
}

// ── HTTP server (serves built frontend) ──────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];
  let filePath = path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback: serve index.html for any unknown route
      filePath = path.join(STATIC_DIR, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404);
        res.end('Not found — build the frontend first (npm run build in frontend/)');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

// ── WebSocket server (attached to HTTP server) ───────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const playerId = uuidv4();
  let currentRoom = null;

  sendTo(ws, { type: 'welcome', playerId });

  function sendRoomList() {
    const list = [];
    for (const [id, room] of rooms) {
      if (room.phase === 'lobby') {
        const playerCount = room.slots.filter((s) => s !== null).length;
        list.push({ roomId: id, players: playerCount, maxPlayers: 3 });
      }
    }
    sendTo(ws, { type: 'room_list', rooms: list });
  }

  sendRoomList();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'list_rooms': {
        sendRoomList();
        break;
      }

      case 'create_room': {
        if (currentRoom) break;
        const room = createRoom();
        currentRoom = room;
        room.clients.set(playerId, { ws, slot: null, name: msg.name || 'Player', currentInput: {} });
        
        sendTo(ws, { type: 'room_joined', roomId: room.id });
        sendTo(ws, lobbyState(room));
        console.log(`Room ${room.id} created by ${msg.name || 'Player'}`);
        break;
      }

      case 'join_room': {
        if (currentRoom) break;
        const room = rooms.get(msg.roomId?.toUpperCase());
        if (!room || room.phase !== 'lobby') {
          sendTo(ws, { type: 'error', message: 'Room not found or game already started' });
          break;
        }
        currentRoom = room;
        room.clients.set(playerId, { ws, slot: null, name: msg.name || 'Player', currentInput: {} });
        
        sendTo(ws, { type: 'room_joined', roomId: room.id });
        broadcastToRoom(room, lobbyState(room));
        console.log(`${msg.name || 'Player'} joined room ${room.id}`);
        break;
      }

      case 'select_corner': {
        if (!currentRoom || currentRoom.phase !== 'lobby') break;
        const slot = msg.slot;
        if (slot < 0 || slot > 2) break;
        const slotOccupant = currentRoom.slots[slot];
        if (slotOccupant !== null && slotOccupant !== playerId) {
          // In dev mode, allow taking AI slots
          if (DEV_MODE && ENABLE_AI_IN_DEV && slotOccupant.toString().startsWith('AI_')) {
            currentRoom.aiPlayers.delete(slot);
          } else {
            sendTo(ws, { type: 'error', message: 'That corner is already taken!' });
            break;
          }
        }
        const client = currentRoom.clients.get(playerId);
        if (client.slot !== null && client.slot !== undefined) {
          const oldSlot = client.slot;
          currentRoom.slots[oldSlot] = null;
          // If old slot was AI, remove it
          if (currentRoom.aiPlayers.has(oldSlot)) {
            currentRoom.aiPlayers.delete(oldSlot);
          }
        }
        currentRoom.slots[slot] = playerId;
        client.slot = slot;
        
        // In dev mode, ensure at least 2 players total (human + AI)
        if (DEV_MODE && ENABLE_AI_IN_DEV) {
          const humanCount = currentRoom.slots.filter(s => s !== null && !s.toString().startsWith('AI_')).length;
          const emptySlots = [0, 1, 2].filter(i => currentRoom.slots[i] === null);
          
          // If only 1 human player, add an AI player to an empty slot
          if (humanCount === 1 && emptySlots.length > 0) {
            const aiSlot = emptySlots[0];
            currentRoom.slots[aiSlot] = 'AI_' + aiSlot;
            currentRoom.aiPlayers.add(aiSlot);
            console.log(`🤖 Auto-added AI player to slot ${aiSlot} in dev mode`);
          }
        }
        
        broadcastToRoom(currentRoom, lobbyState(currentRoom));
        break;
      }

      case 'start_game': {
        if (!currentRoom || currentRoom.phase !== 'lobby') break;
        const humanCount = currentRoom.slots.filter((s) => s !== null && !s.toString().startsWith('AI_')).length;
        const totalCount = currentRoom.slots.filter((s) => s !== null).length;
        
        // In dev mode with AI enabled, allow starting with 1 human player
        if (DEV_MODE && ENABLE_AI_IN_DEV) {
          if (humanCount < 1) {
            sendTo(ws, { type: 'error', message: 'Need at least 1 player to start!' });
            break;
          }
        } else {
          if (totalCount < 2) {
            sendTo(ws, { type: 'error', message: 'Need at least 2 players to start!' });
            break;
          }
        }
        startGame(currentRoom);
        break;
      }

      case 'input': {
        if (!currentRoom || currentRoom.phase !== 'playing') break;
        const client = currentRoom.clients.get(playerId);
        if (!client) break;
        client.currentInput = {
          forward: msg.forward || 0,
          rotate: msg.rotate || 0,
          shoot: !!msg.shoot,
        };
        break;
      }

      case 'god_mode': {
        if (!currentRoom || currentRoom.phase !== 'playing') break;
        const client = currentRoom.clients.get(playerId);
        if (!client || client.slot === null) break;
        const player = currentRoom.state.players.find((p) => p.id === client.slot);
        if (player) {
          player.godMode = true;
        }
        break;
      }

      case 'airstrike': {
        if (!currentRoom || currentRoom.phase !== 'playing') break;
        const client = currentRoom.clients.get(playerId);
        if (!client || client.slot === null) break;
        const ok = triggerAirstrike(currentRoom.state, client.slot);
        if (!ok) {
          sendTo(ws, { type: 'error', message: 'Airstrike already used!' });
        }
        break;
      }

      case 'restart': {
        if (!currentRoom || currentRoom.phase !== 'ended') break;
        if (currentRoom.tickTimer) clearInterval(currentRoom.tickTimer);
        currentRoom.phase = 'lobby';
        broadcastToRoom(currentRoom, lobbyState(currentRoom));
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      removePlayerFromRoom(currentRoom, playerId);
    }
    console.log(`Player ${playerId} disconnected`);
  });
});

// ── Start server ─────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dorito Shooter server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving static files from ${STATIC_DIR}`);
  console.log(`WebSocket ready on ws://0.0.0.0:${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (IS_DEV_MODE) {
    console.log(`🔧 DEVELOPMENT MODE: ENABLED`);
    if (ENABLE_AI_IN_DEV) {
      console.log(`🤖 AI Players: Enabled (auto-fill empty slots)`);
    }
  } else {
    console.log(`🚀 PRODUCTION MODE`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});
