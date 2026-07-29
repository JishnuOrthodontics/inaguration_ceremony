# Dual-Screen 3D Theater

Interactive inauguration experience for **Biomechanics Unveiled 2.0** — a national workshop at Malabar Dental College & Research Centre.

Delegates scan a QR code on the projected main screen, tap their phones to charge shared “energy,” and when the tap goal is reached, velvet stage curtains open and the event brochure / logo is revealed.

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

| URL | Role |
|-----|------|
| `/main/` | Projector / big-screen 3D theater |
| `/controller/?room={id}` | Mobile tap controller |
| `/admin/` | Operator control panel |
| `/assets/brochure.jpg` | Revealed brochure image |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Server | Node.js, Express, Socket.io |
| Session IDs / QR | `uuid`, `qrcode` |
| Main / controller 3D | Three.js **0.164.1** (CDN import maps) |
| Main animation | GSAP **3.12.5** (CDN) |
| Persistence | In-memory only (no database) |
| Auth | None |

---

## Project structure

```
.
├── server.js                 # Express + Socket.io hub
├── package.json
└── public/
    ├── assets/
    │   └── brochure.jpg      # Reveal texture + download
    ├── main/
    │   ├── index.html
    │   ├── main.js           # Three.js stage, curtains, reveal
    │   └── style.css
    ├── controller/
    │   ├── index.html
    │   ├── controller.js     # Crystal UI + taps
    │   └── style.css
    └── admin/
        └── index.html        # Reset / force reveal / targets
```

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

### Useful URLs

- Main: http://localhost:3000/main/
- Admin: http://localhost:3000/admin/
- Controller (example): http://localhost:3000/controller/?room=BU2-XXXXXXXX

For a real hall, phones must reach the host over LAN. The QR is built from the request `Host` / `X-Forwarded-*` headers so it points at the machine serving the page.

---

## Go live (free) — real projector + phones

You have two free options. For a hall inauguration, **Option A (same Wi‑Fi)** is usually best.

### Option A — Same Wi‑Fi / LAN (recommended for the event)

**Cost:** ₹0 · **Latency:** lowest · **No cloud account needed**

Phones and the laptop stay on the **same Wi‑Fi** (college network or a phone hotspot).

1. On the laptop connected to the projector:
   ```bash
   npm install
   npm start
   ```
2. Find the laptop’s LAN IP (Windows PowerShell):
   ```powershell
   ipconfig
   ```
   Look for `IPv4 Address` under the active Wi‑Fi adapter, e.g. `192.168.1.42`.
3. On the projector browser open:
   ```
   http://192.168.1.42:3000/main/
   ```
   **Not** `localhost` — phones cannot open `localhost` on your PC.
4. Scan the on-screen QR with phones. It will already point at  
   `http://192.168.1.42:3000/controller/?room=...`
5. Admin (operator phone/laptop):  
   `http://192.168.1.42:3000/admin/`

**Checklist before guests arrive**

- [ ] Laptop + phones on the same Wi‑Fi
- [ ] Windows Firewall allows Node on port **3000** (Private networks)
- [ ] Open `/main/` once and confirm QR loads
- [ ] Test one phone tap → energy bar moves on the big screen
- [ ] Keep the laptop awake (disable sleep); keep `npm start` running
- [ ] Internet available for CDN assets (Three.js / GSAP / fonts) — or venue Wi‑Fi with internet

If the college Wi‑Fi blocks device-to-device traffic, create a **mobile hotspot** from a phone, connect laptop + guest phones to that hotspot, and use the laptop’s hotspot IP instead.

---

### Option B — Free public URL (Render.com)

Use this if phones cannot join the same LAN, or you want an `https://…onrender.com` link.

**Cost:** Free tier · Supports Socket.io / WebSockets

1. Put the project on **GitHub** (public or private).
2. Sign up at [https://render.com](https://render.com) (free).
3. **New → Web Service** → connect the repo.
4. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
   - **Health check path:** `/health`
5. Deploy. You get a URL like `https://dual-screen-3d-theater.onrender.com`.
6. Projector: `https://YOUR-APP.onrender.com/main/`  
   Phones scan the QR (HTTPS works from any network with internet).

A `render.yaml` file is included so Render can pick up the free web service config automatically if you use Blueprint.

**Important free-tier caveats**

| Issue | What to do |
|-------|------------|
| Sleeps after ~15 min idle | Open the site ~5 minutes before the ceremony so it wakes |
| Cold start ~30–60s | Wait for the first load; then keep a tab open on `/main/` |
| Restart clears sessions | Don’t restart mid-ceremony; use Admin **Reset** instead |
| No auth on `/admin` | Don’t share the admin URL publicly |

**Wake-up tip:** Before guests enter, open `/main/` and `/admin/` on the operator device and leave them connected.

---

### What not to use (for this app)

Static hosts like **Netlify / Vercel / GitHub Pages** are free but **cannot** run this Socket.io Node server. You need a long-lived Node process (LAN laptop or Render/Fly/Railway-style host).

---

### Event-day recommended setup

| Role | Device | URL |
|------|--------|-----|
| Stage | Laptop → HDMI projector | `/main/` |
| Operator | Second laptop or phone | `/admin/` |
| Delegates | Phones | Scan QR |

Prefer **Option A** for the live inauguration. Use **Option B** if you need internet-wide access.

---

## Backend API

### Public

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/session` | Get or create the active session |
| `GET` | `/api/qr/:sessionId` | QR data URL + controller join URL |

### Admin (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/status` | Live session status |
| `POST` | `/api/admin/reset` | Clear taps / un-reveal / notify clients |
| `POST` | `/api/admin/force-reveal` | Jump to reveal |
| `POST` | `/api/admin/target-taps` | Body: `{ "targetTaps": number }` |
| `POST` | `/api/admin/new-session` | Body: `{ "targetTaps"?: number }` — new room ID |

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

Clients emit `join-session` with the session id, then:

| Event | Direction | Meaning |
|-------|-----------|---------|
| `state-update` | server → client | Full sync on join / admin changes |
| `tap` | controller → server | Count a tap (rate-limited to **5 / sec / socket**) |
| `energy-update` | server → room | `{ tapCount, progress }` |
| `revealed` | server → room | Target reached (or force reveal) |
| `reset` | server → room | Admin reset |
| `client-count` | server → room | Connected sockets in the room |
| `error` | server → client | e.g. unknown session |

---

## Admin panel

Use `/admin/` during the ceremony to:

- Watch session ID, tap count, progress, connected clients
- **Reset** — rehearse again without a new QR (same session)
- **Force Reveal** — skip waiting for taps
- **New Session** — new ID (refresh main screen so the QR updates)
- Change **Target Taps** (10–500) and Apply

There is **no login**. Do not expose `/admin` on a public internet without protection.

---

## Visual design (main stage)

- Warm theatrical palette: charcoal / burgundy hall, amber–gold lighting, cream columns, crimson velvet
- Custom shader curtains: vertical pleats, gathered rod, wavy hem, bunch-open (not flat slide)
- Brochure mesh uses `/assets/brochure.jpg`
- HUD energy bar + connected count after first tap

---

## Operational notes

1. **Hard-refresh** the projector (`Ctrl+F5`) after code or brochure asset changes.
2. After **New Session**, reload `/main/` so the QR matches the new room.
3. Restarting Node **clears all sessions** (RAM only).
4. Three.js / GSAP / fonts load from CDNs — confirm internet (or vendor locally) for offline venues.
5. `connectedClients` counts every socket in the room (main + admin + phones), not phones only.
6. Late join on **controller** shows the celebration UI if already revealed; **main** currently keeps the QR overlay unless a live `revealed` / tap flow has already run — prefer keeping the projector page open for the whole ceremony.

---

## Scripts

```json
"start": "node server.js",
"dev": "node server.js"
```

---

## License / event

Built for the live inauguration of **Biomechanics Unveiled 2.0**. Package name: `dual-screen-3d-theater`.
