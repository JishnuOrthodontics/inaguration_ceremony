(function () {
  'use strict';

  const form = document.getElementById('join-form');
  const input = document.getElementById('code-input');
  const liveBtn = document.getElementById('join-live');
  const status = document.getElementById('status');

  function setStatus(msg, type) {
    status.textContent = msg || '';
    status.className = 'status' + (type ? ' ' + type : '');
  }

  function setBusy(busy) {
    form.querySelector('button[type="submit"]').disabled = busy;
    liveBtn.disabled = busy;
  }

  async function resolveAndGo(code) {
    setBusy(true);
    setStatus('Connecting…');
    try {
      const q = code ? `?code=${encodeURIComponent(code)}` : '';
      const res = await fetch(`/api/join/resolve${q}`);
      if (!res.ok) throw new Error('Could not resolve ceremony');
      const data = await res.json();
      if (!data.url) throw new Error('No join URL returned');
      setStatus('Opening controller…', 'ok');
      window.location.href = data.url;
    } catch (err) {
      setStatus(err.message || 'Join failed — try again', 'error');
      setBusy(false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = (input.value || '').trim();
    if (!code) {
      setStatus('Enter the code shown on the big screen', 'error');
      input.focus();
      return;
    }
    resolveAndGo(code);
  });

  liveBtn.addEventListener('click', () => {
    resolveAndGo('');
  });

  // Prefill from ?code= if present
  const prefill = new URLSearchParams(window.location.search).get('code');
  if (prefill) {
    input.value = prefill.toUpperCase();
  }
})();
