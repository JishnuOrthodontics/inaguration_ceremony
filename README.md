# Dual-Screen 3D Theater

Interactive inauguration experience for **Biomechanics Unveiled 2.0** — a national workshop at Malabar Dental College & Research Centre.

Delegates scan a QR code on the projected main screen, tap their phones to charge shared “energy,” and when the tap goal is reached, velvet stage curtains open and the event brochure / logo is revealed.

---

## Live production

| | URL |
|--|-----|
| **App (root → main)** | https://inaguration-ceremony.onrender.com/ |
| **Projector** | https://inaguration-ceremony.onrender.com/main/ |
| **Admin** | https://inaguration-ceremony.onrender.com/admin/ |
| **GitHub** | https://github.com/JishnuOrthodontics/inaguration_ceremony |

Hosted on **Render** (free web service). Auto-deploys on push to `main`.

**Before the ceremony:** open `/main/` about 5 minutes early so the free instance wakes and stays active while guests tap.

---

## Ceremony flow

1. **Projector** opens `/main/` — 3D theater stage with QR overlay (“SCAN TO INAUGURATE”).
2. **Delegates** scan the QR → phone opens `/controller/?room={sessionId}`.
3. **First tap** starts the stage ceremony: QR hides, energy HUD appears, curtains begin opening with progress.
4. **All phones share one pool** — every later joiner’s taps still count toward the same target.
5. When **total taps ≥ target** (default **50**), the stage runs the reveal sequence (curtains bunch open, brochure rises, confetti) and phones show the celebration screen with a brochure link.

Joining alone does not start motion on the big screen — the **first tap** does.

---

## Surfaces

| Path | Role |
|------|------|
| `/` | Redirects to `/main/` |
| `/main/` | Projector / big-screen 3D theater |
| `/controller/?room={id}` | Mobile tap controller |
| `/admin/` | Operator control panel |
| `/assets/brochure.jpg` | Revealed brochure image |
| `/vendor/socket.io.min.js` | Local Socket.io client (no CDN) |
| `/health` · `/healthz` | Health checks for Render |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Server | Node.js, Express, Socket.io |
| Session IDs / QR | `uuid`, `qrcode` |
| Realtime client | Socket.io served from `/vendor/` (works when CDNs are blocked on mobile) |
| Main / controller 3D | Three.js **0.164.1** (CDN; optional on phones) |
| Main animation | GSAP **3.12.5** (CDN) |
| Persistence | In-memory only (no database) |
| Auth | None |
| Hosting | Render free web service |

---

## Project structure

```
.
├── server.js                      # Express + Socket.io hub
├── package.json
├── render.yaml                    # Render free-tier blueprint
├── README.md
└── public/
    ├── vendor/
    │   └── socket.io.min.js       # Bundled client (mobile-safe)
    ├── assets/
    │   └── brochure.jpg
    ├── main/
    │   ├── index.html
    │   ├── main.js                # 3D stage, velvet curtains, reveal
    │   └── style.css
    ├── controller/
    │   ├── index.html
    │   ├── controller-core.js     # Taps + Socket.io (always loads)
    │   ├── controller.js          # Optional 3D crystal visuals
    │   └── style.css
    └── admin/
        └── index.html
```

### Mobile controller design

- **`controller-core.js`** — plain script: join room, emit taps, update % UI. Does **not** depend on Three.js.
- **`#tap-surface`** — full-screen tap button so phones register touches reliably.
- **`controller.js`** — optional 3D crystal; if import maps / Three.js fail on a phone, taps still work.

---

## Run locally

```bash
npm install
npm start
```

Server listens on `http://0.0.0.0:3000` by default.

Optional env:

- `PORT` — port (default `3000`)
- `HOST` — bind address (default `0.0.0.0`)

### Local URLs

- Main: http://localhost:3000/main/
- Admin: http://localhost:3000/admin/
- Controller: http://localhost:3000/controller/?room=BU2-XXXXXXXX

---

## Go live options

### A — Public URL (current production)

Already deployed:

- Repo: `JishnuOrthodontics/inaguration_ceremony`
- Service: Render free → `https://inaguration-ceremony.onrender.com`

Push to `main` to redeploy. Health check: `/health` or `/healthz`.

### B — Same Wi‑Fi / LAN (backup for the hall)

If the cloud is slow or offline:

1. `npm start` on the projector laptop  
2. Open `http://{LAN-IP}:3000/main/` (not `localhost`)  
3. Phones on the same Wi‑Fi scan the QR  

Use a phone hotspot if college Wi‑Fi blocks device-to-device traffic.

### Do not use

**Netlify / Vercel / GitHub Pages** — static only; they cannot run this Socket.io server.

---

## Event-day checklist

- [ ] Open https://inaguration-ceremony.onrender.com/main/ ~5 min early (wake free tier)
- [ ] Confirm QR appears (not stuck on “Generating…”)
- [ ] Test **one phone**: scan QR → tap → main energy bar moves
- [ ] Open Admin in a second tab/phone for Reset / Force Reveal
- [ ] Keep projector tab open for the whole ceremony
- [ ] After any **New Session**, refresh `/main/` so the QR matches

| Role | Device | URL |
|------|--------|-----|
| Stage | Laptop → HDMI projector | `/main/` |
| Operator | Second device | `/admin/` |
| Delegates | Phones | Scan on-screen QR |

---

## Backend API

### Public

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Redirect to `/main/` |
| `GET` | `/health` · `/healthz` | Liveness |
| `GET` | `/api/session` | Get or create the active session |
| `GET` | `/api/qr/:sessionId` | QR data URL + controller join URL |

### Admin (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/status` | Live session status |
| `POST` | `/api/admin/reset` | Clear taps / un-reveal |
| `POST` | `/api/admin/force-reveal` | Jump to reveal |
| `POST` | `/api/admin/target-taps` | Body: `{ "targetTaps": number }` |
| `POST` | `/api/admin/new-session` | Body: `{ "targetTaps"?: number }` |

### Session shape

```js
{
  id: "BU2-A1B2C3D4",
  tapCount: 0,
  targetTaps: 50,
  progress: 0,          // 0–1
  isRevealed: false,
  connectedClients: 0,
  lastTapTime: 0,
  createdAt: <timestamp>
}
```

---

## Socket.io events

| Event | Direction | Meaning |
|-------|-----------|---------|
| `join-session` | client → server | Join room (missing rooms fall back to active) |
| `session-redirect` | server → client | Joined a different live room after restart |
| `state-update` | server → client | Full sync on join / admin changes |
| `tap` | controller → server | Count a tap (max **5 / sec / socket**) |
| `energy-update` | server → room | `{ tapCount, progress }` |
| `revealed` | server → room | Target reached (or force reveal) |
| `reset` | server → room | Admin reset |
| `client-count` | server → room | Connected sockets in the room |
| `error` | server → client | Connection / session errors |

After Render sleep or redeploy, in-memory sessions are cleared. Controllers automatically join the **active** live room (`session-redirect`). Always prefer scanning the **current** QR on the projector.

---

## Admin panel

- Live session ID, taps, progress, connected clients  
- **Reset** — rehearse again (same session ID)  
- **Force Reveal** — skip waiting for taps  
- **New Session** — new ID (refresh main for a new QR)  
- **Target Taps** slider (10–500)  

No login — do not share `/admin` publicly beyond operators.

---

## Visual design (main stage)

- Warm theatrical palette: charcoal / burgundy hall, amber–gold lighting, cream columns, crimson velvet  
- Shader curtains: vertical pleats, gathered rod, wavy hem, bunch-open (not a flat slide)  
- Brochure mesh from `/assets/brochure.jpg`  
- HUD energy bar + connected count after first tap  

---

## Operational notes

1. Hard-refresh projector (`Ctrl+F5`) after deploys or brochure changes.  
2. Free Render sleeps after ~15 min idle — wake `/main/` before guests arrive.  
3. Socket.io is **local** (`/vendor/`); Three.js / GSAP / fonts still use CDN when available.  
4. `connectedClients` counts all sockets (main + admin + phones).  
5. Keep the projector page open for the whole ceremony so the QR stays in sync.

---

## Scripts

```bash
npm start   # node server.js
npm run dev # same
```

---

## License / event

Built for the live inauguration of **Biomechanics Unveiled 2.0**.  
Package name: `dual-screen-3d-theater`.
