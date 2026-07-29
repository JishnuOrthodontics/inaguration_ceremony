/**
 * Controller core — Socket.io + taps (no Three.js).
 * Runs as a classic script so mobile still works if 3D / import maps fail.
 */
(function () {
  'use strict';

  const CIRCUMFERENCE = 2 * Math.PI * 90;

  const urlParams = new URLSearchParams(window.location.search);
  let activeRoomId = urlParams.get('room');

  let progress = 0;
  let targetProgress = 0;
  let tapCount = 0;
  let targetTaps = 50;
  let isRevealed = false;
  let hasStartedTapping = false;
  let consecutiveTaps = 0;
  let lastTapTime = 0;
  let lastTapEmitAt = 0;
  let audioCtx = null;

  const statusText = document.getElementById('status-text');
  const tapCountEl = document.getElementById('tap-count');
  const progressPercent = document.getElementById('progress-percent');
  const progressCircle = document.getElementById('progress-circle');
  const tapPrompt = document.getElementById('tap-prompt');
  const revealedScreen = document.getElementById('revealed-screen');
  const tapSurface = document.getElementById('tap-surface');

  if (!activeRoomId) {
    statusText.textContent = 'Error: No room ID — scan the QR on the main screen';
    statusText.style.color = '#ff4444';
  }

  // ── Audio ──────────────────────────────────────────────────────────────
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) { /* ignore */ }
  }

  function playTapSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const baseFreq = 400 + consecutiveTaps * 30 + progress * 600;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  function playRevealSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 600 + i * 200;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.08, now + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.8);
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────
  function updateProgressUI(prog, count) {
    if (progressCircle) {
      progressCircle.style.strokeDashoffset = Math.max(0, CIRCUMFERENCE * (1 - prog));
    }
    if (progressPercent) progressPercent.textContent = String(Math.round(prog * 100));
    if (tapCountEl) tapCountEl.textContent = `${count} / ${targetTaps}`;

    if (isRevealed) return;
    if (prog < 0.1) statusText.textContent = 'Tap anywhere to charge';
    else if (prog < 0.5) statusText.textContent = 'Charging the Inauguration...';
    else if (prog < 0.9) statusText.textContent = 'Almost there! Keep tapping!';
    else if (prog < 1) statusText.textContent = 'Final push!';
  }

  function showRevealedScreen() {
    revealedScreen.classList.remove('hidden');
    if (tapSurface) tapSurface.style.pointerEvents = 'none';
  }

  function spawnRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'tap-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    const hue = 270 - progress * 180;
    ripple.style.borderColor = `hsl(${hue}, 70%, 60%)`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  function emitVisual(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  // ── Socket ─────────────────────────────────────────────────────────────
  function startSocket() {
    if (typeof io !== 'function') {
      statusText.textContent = 'Connection library failed to load — check internet';
      statusText.style.color = '#ff4444';
      return;
    }

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      path: '/socket.io'
    });

    function joinRoom(id) {
      if (!id) return;
      activeRoomId = id;
      socket.emit('join-session', id);
    }

    socket.on('connect', () => {
      if (activeRoomId) joinRoom(activeRoomId);
    });

    if (activeRoomId) joinRoom(activeRoomId);

    socket.on('energy-update', (data) => {
      targetProgress = data.progress;
      progress = data.progress;
      tapCount = data.tapCount;
      updateProgressUI(data.progress, data.tapCount);
      emitVisual('inaug:progress', { progress: data.progress, tapCount: data.tapCount });
    });

    socket.on('state-update', (data) => {
      targetProgress = data.progress;
      progress = data.progress;
      tapCount = data.tapCount || 0;
      targetTaps = data.targetTaps || 50;
      isRevealed = !!data.isRevealed;

      statusText.style.color = '';
      if (!isRevealed && !hasStartedTapping) {
        statusText.textContent = 'Tap anywhere to charge';
      }

      updateProgressUI(data.progress, tapCount);
      emitVisual('inaug:progress', { progress: data.progress, tapCount });

      if (isRevealed) showRevealedScreen();
    });

    socket.on('session-redirect', (data) => {
      if (!data || !data.sessionId) return;
      activeRoomId = data.sessionId;
      const url = new URL(window.location.href);
      url.searchParams.set('room', data.sessionId);
      window.history.replaceState({}, '', url);
      statusText.textContent = data.message || 'Connected to live session';
      statusText.style.color = '#86efac';
      setTimeout(() => {
        if (!hasStartedTapping && !isRevealed) {
          statusText.textContent = 'Tap anywhere to charge';
          statusText.style.color = '';
        }
      }, 2000);
    });

    socket.on('revealed', () => {
      isRevealed = true;
      playRevealSound();
      emitVisual('inaug:reveal', {});
      setTimeout(showRevealedScreen, 1200);
    });

    socket.on('reset', () => {
      isRevealed = false;
      targetProgress = 0;
      progress = 0;
      tapCount = 0;
      consecutiveTaps = 0;
      hasStartedTapping = false;
      updateProgressUI(0, 0);
      revealedScreen.classList.add('hidden');
      if (tapSurface) tapSurface.style.pointerEvents = 'auto';
      tapPrompt.classList.remove('hidden');
      statusText.textContent = 'Tap anywhere to charge';
      statusText.style.color = '';
      emitVisual('inaug:reset', {});
    });

    socket.on('error', (data) => {
      statusText.textContent = (data && data.message) || 'Connection error';
      statusText.style.color = '#ff4444';
    });

    // Wire taps after socket exists
    wireTaps(socket);
  }

  function wireTaps(socket) {
    function handleTap(event) {
      if (isRevealed) return;
      if (!activeRoomId) return;
      if (typeof event.button === 'number' && event.button !== 0) return;

      const now = Date.now();
      if (now - lastTapEmitAt < 50) return;
      lastTapEmitAt = now;

      if (event.cancelable) event.preventDefault();

      initAudio();

      if (now - lastTapTime > 500) consecutiveTaps = 0;
      consecutiveTaps++;
      lastTapTime = now;

      if (!hasStartedTapping) {
        hasStartedTapping = true;
        tapPrompt.classList.add('hidden');
      }

      socket.emit('tap');
      playTapSound();

      if (navigator.vibrate) navigator.vibrate(10);

      const point = event.touches && event.touches[0]
        || event.changedTouches && event.changedTouches[0]
        || event;
      const x = point.clientX != null ? point.clientX : window.innerWidth / 2;
      const y = point.clientY != null ? point.clientY : window.innerHeight / 2;
      spawnRipple(x, y);

      emitVisual('inaug:tap', { x, y, progress, consecutiveTaps });
    }

    function onPointerDown(e) { handleTap(e); }
    function onTouchStart(e) {
      if (window.PointerEvent) return;
      handleTap(e);
    }

    const surface = tapSurface || document.body;
    surface.addEventListener('pointerdown', onPointerDown, { passive: false });
    surface.addEventListener('touchstart', onTouchStart, { passive: false });
    if (tapSurface) {
      document.body.addEventListener('pointerdown', (e) => {
        if (e.target === tapSurface) return;
        if (e.target && e.target.closest && e.target.closest('a,button')) return;
        onPointerDown(e);
      }, { passive: false });
    }
  }

  function ensureIoThenStart() {
    if (typeof io === 'function') {
      startSocket();
      return;
    }
    // Fallback: inject local vendor script if CDN/tag failed
    const s = document.createElement('script');
    s.src = '/vendor/socket.io.min.js';
    s.onload = () => startSocket();
    s.onerror = () => {
      statusText.textContent = 'Connection library failed to load — refresh and try again';
      statusText.style.color = '#ff4444';
    };
    document.head.appendChild(s);
  }

  ensureIoThenStart();

  // Shared state for optional 3D module
  window.InaugController = {
    get progress() { return progress; },
    get targetProgress() { return targetProgress; },
    get isRevealed() { return isRevealed; },
    get tapCount() { return tapCount; }
  };

  // SVG gradient for progress ring
  const svg = document.querySelector('.progress-ring');
  if (svg && !svg.querySelector('#progressGradient')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'progressGradient');
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '100%');
    [['0%', '#003B8E'], ['50%', '#00A3D9'], ['100%', '#66ccff']].forEach(([offset, color]) => {
      const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.insertBefore(defs, svg.firstChild);
  }
})();
