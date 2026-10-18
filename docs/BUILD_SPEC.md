# SentinelCatch Build Specification (v3)

## 1. Product Overview
SentinelCatch is an autonomous, 24/7 web-based maritime intelligence operations system for Kenyan fisheries officers. It detects "dark vessels" (ships operating without AIS transponders or turning off AIS) within Kenya's Exclusive Economic Zone (EEZ) by cross-referencing satellite Synthetic Aperture Radar (SAR) vessel detections against Automatic Identification System (AIS) presence, scores suspicious cases using rule-based reasoning and an LLM, and broadcasts real-time on-site alerts with 3D globe visualization.

No user login. No paid services. No new hardware. No simulated or mock data in the live app.

---

## 2. Technical Stack & Deployment Architecture
- **Runtime**: Node.js 20 (ESM), Express 4, PostgreSQL (`pg`, plain SQL migrations), `node-cron`, `zod`, `helmet`, `express-rate-limit`, `pino`.
- **Frontend**: React + Vite + MapLibre GL JS (Flat projection & 3D Globe), mobile-first responsive operations dashboard, Server-Sent Events (SSE) live updates.
- **Hosting & Deployment**: One Render Web Service (Node.js, Starter plan, always on) serving API, static frontend build, scheduler, and AIS WebSocket client; Render PostgreSQL.
- **Integrations & Secrets**: Environment variables only. Postgres advisory lock (`pg_try_advisory_lock`) ensures pipeline runs never overlap.
- **Timezone**: All timestamps stored in UTC and rendered with dual UTC and Africa/Nairobi (EAT, UTC+3) display.

---

## 3. Integrations & Third-Party Keys
### Required
1. **Global Fishing Watch (GFW) API** (`GFW_API_TOKEN`):
   - Sentinel-1 SAR vessel presence/detections (`public-global-sar-presence:latest`).
   - AIS vessel presence (`public-global-presence:latest`).
   - AIS gap events (`public-global-gaps-events:latest`).
   - Loitering events (`public-global-loitering-events:latest`).
   - Encounter events (`public-global-encounters-events:latest`).
   - Fishing effort (`public-global-fishing-effort:latest`).
   - Port visits (`public-global-port-visits-events:latest`).
   - Kenya EEZ and MPA geometries.
2. **LLM Provider** (`GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, `LLM_MODEL`):
   - Structured JSON output validated with Zod: `{ score_adjustment: number (-15..+15), rationale: string, key_factors: string[] }`.
   - Deterministic rule-based template fallback when LLM is unavailable or unconfigured.
3. **PostgreSQL** (`DATABASE_URL`).

### Recommended
4. **AISStream.io** (`AISSTREAM_API_KEY`):
   - Persistent WebSocket connection for Kenya EEZ bounding box.
   - Auto-reconnect with exponential backoff.
   - Stores positions in `ais_positions` with 72-hour TTL.
   - Feeds live ship layer, fleet-proximity feature, and AIS coverage estimation.

### No Key Needed
5. **Open-Meteo Marine API**:
   - Hourly wave height and wind speed at detection coordinates.
   - Computes sea state impact on radar detection reliability.

### Optional (Degrades Gracefully)
6. **Copernicus Data Space Ecosystem** (`COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET`):
   - Sentinel Hub Process API for Sentinel-1 radar chips and Sentinel-2 optical chips around High-band cases.
7. **Map Style / Provider** (`MAP_STYLE_URL`, optional `MAPTILER_KEY`):
   - Free dark basemap style permitted for open public use (e.g., CARTO Dark Matter or Demotiles).
8. **Access Gate** (`ACCESS_CODE`): Optional password gate via header/cookie.

*Note: All external delivery channels (Telegram, Email/SMTP, SMS, Web Push/VAPID) have been removed per CR v3.*

---

## 4. Multi-Agent Pipeline & Extensible Behaviors
### 4.1 Detection Agent (`server/src/agents/detection.js`)
- Pulls SAR detections and AIS presence within the Kenya EEZ bounding box for the target window.
- Performs spatial-temporal cross-referencing with configurable tolerances.
- Identifies radar detections lacking corresponding AIS signals.
- Idempotent: generates a unique deterministic hash per detection.
- Computes geographic sector (Lamu, Malindi-Kilifi, Mombasa, South Coast/Vanga) and nautical distance/bearing label (e.g., "38 km E of Lamu").

### 4.2 Reasoning Agent (`server/src/agents/reasoning.js`)
- Computes 10 operational features for each unmatched detection:
  1. *Loitering recurrence*: Detections within 10 km over previous 14 days + GFW loitering events.
  2. *EEZ boundary proximity*: Distance to EEZ border (< 25 km increases suspicion).
  3. *Displacement pattern*: Stationary vs transit between recurrent passes.
  4. *AIS gap context*: Proximity and recency of GFW AIS gap events.
  5. *Fleet proximity*: Active AIS fishing vessels within 20 km.
  6. *Port & shore proximity*: Distance to coast and nearest port (< 10 km lowers score).
  7. *Marine Protected Area (MPA)*: Boundary intersection.
  8. *Estimated vessel length*: Radar backscatter size.
  9. *Sea state*: Open-Meteo wave height / wind speed detection confidence penalty.
  10. *AIS coverage confidence*: Cell reception confidence.
- Computes transparent rule score (0-100).
- Calls LLM wrapper with facts-only JSON; receives bounded adjustment (-15..+15) and 2-3 sentence rationale.
- Final Score = `clamp(rule_score + adjustment, 0, 100)`.
- Bands: High (≥70), Medium (45-69), Low (<45).

### 4.3 Alert Agent (`server/src/agents/alert.js`)
- Generates tactical briefs for cases meeting alert criteria.
- Persists notification records in `notifications` table.
- Emits real-time updates via Server-Sent Events (`/api/stream`).
- Spatial deduplication: Recurrence within 10 km over 7 days updates existing case and triggers alert only on significant score increase (≥+10).

### 4.4 Behavior Plugins (`server/src/behaviors/`)
- Pluggable interface: `{ id, name, description, detectCandidates(), features(), weights }`.
- Built-in behaviors:
  1. `dark-vessel`: Core unmatched radar detection.
  2. `possible-transshipment`: Unmatched detection stationary within 2 km of an AIS vessel with loitering/encounter event.

---

## 5. On-Site Real-Time Notification Architecture
- **Storage**: `notifications` table (`id`, `case_id`, `type`, `band`, `headline`, `body`, `lat`, `lon`, `sector`, `score`, `created_at`, `broadcast_latency_ms`).
- **Transport**: Server-Sent Events (SSE) at `GET /api/stream` with 25s keepalive heartbeat, `Last-Event-ID` resume, backoff reconnect.
- **Fallback**: Polling `GET /api/notifications?since=<timestamp>` every 30s.
- **Client Features**:
  - Bell icon with unread badge based on client `localStorage`.
  - Notification drawer with severity badge, time ago, and click-to-fly map centering.
  - High band: toast banner, pulsing map marker, optional user-activated audio chime, background tab title alert (`(n) SentinelCatch`).
  - Desktop Notification API support while tab remains open.
  - "Send system test notification" button generating non-vessel test alerts.

---

## 6. Frontend Operations UI (MapLibre 3D Globe + Flat)
- **Map Viewports**: Toggleable Flat (Mercator) vs 3D Globe projection powered by MapLibre GL JS.
- **Header**: Live status badge with heartbeat timer, time-ago staleness indicators, search bar, notification bell, theme toggle, EN/SW language switch.
- **Left Navigation Rail**: Feed (cases), Alerts, Ships (AIS), Zones (EEZ & MPAs), Insights (analytics charts), Validation, Status, Objectives.
- **Layers**: Kenya EEZ boundary, MPAs, dark vessel cases, raw SAR detections, live AIS ships, AIS coverage confidence grid, ports, sea state.
- **Intel Panel**: Detailed case breakdown, feature chips, raw JSON inspection, Copernicus imagery chips, action buttons (Acknowledge, Dispatch, False Alarm), WhatsApp brief link, Copy brief.
- **Time Scrubbing**: 24h / 7d / 30d / 60d filters with detection animation playback.
- **Mobile Experience**: Bottom navigation bar and expandable bottom sheets.

---

## 7. Verification & Objectives Scorecard
- Endpoint `GET /api/objectives` and UI page `/objectives` reporting live evaluation against Concept Note Objectives 1 through 5 and Methodology 3.1 to 3.5.
- Automated validation runner: `npm run validate -- --from <date> --to <date>` executing negative controls, harbour controls, and deterministic re-runs.
- Deployed smoke & verification script: `npm run verify:objectives -- --url <url>` generating `docs/COMPLIANCE.md` with factual proof.
