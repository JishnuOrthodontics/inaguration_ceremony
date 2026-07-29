/**
 * Dual-Screen 3D Theater — Backend Server
 * 
 * Express + Socket.io state hub for the inauguration experience.
 * Manages sessions, tap counting, rate limiting, and state broadcasting.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── Session State ───────────────────────────────────────────────────────────

const sessions = {};
let activeSessionId = null;

function createSession(targetTaps = 50) {
  const id = 'BU2-' + uuidv4().slice(0, 8).toUpperCase();
  sessions[id] = {
    id,
    tapCount: 0,
    targetTaps,
    progress: 0,
    isRevealed: false,
    connectedClients: 0,
    lastTapTime: 0,
    createdAt: Date.now()
  };
  activeSessionId = id;
  console.log(`[Session] Created: ${id} (target: ${targetTaps} taps)`);
  return sessions[id];
}

function getOrCreateSession() {
  if (activeSessionId && sessions[activeSessionId]) {
    return sessions[activeSessionId];
  }
  return createSession();
}

// ─── Static File Serving ─────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── API Routes ──────────────────────────────────────────────────────────────

// Health check (for free hosts like Render)
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// Get or create the active session
app.get('/api/session', (req, res) => {
  const session = getOrCreateSession();
  res.json({ sessionId: session.id, session });
});

// Generate QR code as data URL
app.get('/api/qr/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    // Build the controller URL — use the request's host header for flexibility
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const controllerUrl = `${protocol}://${host}/controller/?room=${sessionId}`;

    const qrDataUrl = await QRCode.toDataURL(controllerUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#FFFFFF',
        light: '#00000000' // transparent background
      },
      errorCorrectionLevel: 'M'
    });

    res.json({ qr: qrDataUrl, url: controllerUrl });
  } catch (err) {
    console.error('[QR] Error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Admin: Reset session
app.post('/api/admin/reset', (req, res) => {
  const session = getOrCreateSession();
  session.tapCount = 0;
  session.progress = 0;
  session.isRevealed = false;
  session.lastTapTime = 0;

  io.to(session.id).emit('state-update', {
    tapCount: session.tapCount,
    progress: session.progress,
    isRevealed: session.isRevealed,
    targetTaps: session.targetTaps
  });
  io.to(session.id).emit('reset');

  console.log(`[Admin] Session ${session.id} RESET`);
  res.json({ success: true, session });
});

// Admin: Force reveal
app.post('/api/admin/force-reveal', (req, res) => {
  const session = getOrCreateSession();
  if (!session.isRevealed) {
    session.tapCount = session.targetTaps;
    session.progress = 1;
    session.isRevealed = true;

    io.to(session.id).emit('energy-update', {
      tapCount: session.tapCount,
      progress: 1
    });
    io.to(session.id).emit('revealed');

    console.log(`[Admin] Session ${session.id} FORCE REVEALED`);
  }
  res.json({ success: true, session });
});

// Admin: Update target taps
app.post('/api/admin/target-taps', (req, res) => {
  const { targetTaps } = req.body;
  if (!targetTaps || targetTaps < 1) {
    return res.status(400).json({ error: 'Invalid targetTaps' });
  }
  const session = getOrCreateSession();
  session.targetTaps = targetTaps;
  session.progress = Math.min(session.tapCount / session.targetTaps, 1);

  io.to(session.id).emit('state-update', {
    tapCount: session.tapCount,
    progress: session.progress,
    isRevealed: session.isRevealed,
    targetTaps: session.targetTaps
  });

  console.log(`[Admin] Target taps updated to ${targetTaps}`);
  res.json({ success: true, session });
});

// Admin: Create new session
app.post('/api/admin/new-session', (req, res) => {
  const { targetTaps } = req.body;
  const session = createSession(targetTaps || 50);
  res.json({ success: true, session });
});

// Admin: Get session status
app.get('/api/admin/status', (req, res) => {
  const session = getOrCreateSession();
  res.json({ session });
});

// ─── Socket.io Real-Time Logic ───────────────────────────────────────────────

// Rate limiting map: socketId → last tap timestamps
const tapTimestamps = new Map();
const MAX_TAPS_PER_SECOND = 5;

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Client joins a session room
  socket.on('join-session', (sessionId) => {
    // Validate session exists
    if (!sessions[sessionId]) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    socket.join(sessionId);
    socket.sessionId = sessionId;
    sessions[sessionId].connectedClients++;

    // Send current state to the new client
    const session = sessions[sessionId];
    socket.emit('state-update', {
      tapCount: session.tapCount,
      progress: session.progress,
      isRevealed: session.isRevealed,
      targetTaps: session.targetTaps
    });

    // Broadcast updated client count
    io.to(sessionId).emit('client-count', {
      count: session.connectedClients
    });

    console.log(`[Socket] ${socket.id} joined session ${sessionId} (${session.connectedClients} clients)`);
  });

  // Handle tap events from mobile controllers
  socket.on('tap', () => {
    const sessionId = socket.sessionId;
    if (!sessionId || !sessions[sessionId]) return;

    const session = sessions[sessionId];
    if (session.isRevealed) return;

    // ── Rate Limiting ──
    const now = Date.now();
    if (!tapTimestamps.has(socket.id)) {
      tapTimestamps.set(socket.id, []);
    }
    const timestamps = tapTimestamps.get(socket.id);
    // Remove timestamps older than 1 second
    while (timestamps.length > 0 && timestamps[0] < now - 1000) {
      timestamps.shift();
    }
    if (timestamps.length >= MAX_TAPS_PER_SECOND) {
      return; // Rate limited — silently ignore
    }
    timestamps.push(now);

    // ── Update State ──
    session.tapCount++;
    session.lastTapTime = now;
    session.progress = Math.min(session.tapCount / session.targetTaps, 1);

    // Broadcast energy update to ALL clients in this room
    io.to(sessionId).emit('energy-update', {
      tapCount: session.tapCount,
      progress: session.progress
    });

    // Check for reveal
    if (session.progress >= 1 && !session.isRevealed) {
      session.isRevealed = true;
      // Small delay for dramatic effect — let the final energy update render first
      setTimeout(() => {
        io.to(sessionId).emit('revealed');
        console.log(`[Session] ${sessionId} REVEALED! 🎉 (${session.tapCount} taps)`);
      }, 300);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const sessionId = socket.sessionId;
    if (sessionId && sessions[sessionId]) {
      sessions[sessionId].connectedClients = Math.max(0, sessions[sessionId].connectedClients - 1);
      io.to(sessionId).emit('client-count', {
        count: sessions[sessionId].connectedClients
      });
    }
    tapTimestamps.delete(socket.id);
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🎭 ═══════════════════════════════════════════════════════════');
  console.log('  ║                                                           ║');
  console.log('  ║   DUAL-SCREEN 3D THEATER — Inauguration Experience        ║');
  console.log('  ║   Biomechanics Unveiled 2.0                               ║');
  console.log('  ║                                                           ║');
  console.log(`  ║   Main Screen:  http://localhost:${PORT}/main/              ║`);
  console.log(`  ║   Controller:   http://localhost:${PORT}/controller/        ║`);
  console.log(`  ║   Admin Panel:  http://localhost:${PORT}/admin/             ║`);
  console.log('  ║                                                           ║');
  console.log('  ═══════════════════════════════════════════════════════════ 🎭');
  console.log('');
});
