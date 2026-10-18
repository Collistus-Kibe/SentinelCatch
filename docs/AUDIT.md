# SentinelCatch Repository Audit

**Date**: 2026-10-13  
**Auditor**: SentinelCatch Engineering Team  
**Reference Document**: [docs/BUILD_SPEC.md](file:///c:/Users/Admin/OneDrive/Documentos/SentinelCatch/docs/BUILD_SPEC.md)

---

## Executive Summary
This audit reviews the current repository state against the updated Build Specification v3 (incorporating Change Request v3: on-site notifications only, MapLibre flat/3D globe UI, and live objectives verification).

| Category | Target State (Build Spec v3) | Current State | Gap Status |
|---|---|---|---|
| **Agents** | Detection Agent, Reasoning Agent, Alert Agent (`server/src/agents/`) | Directory does not exist; no agent logic implemented | 🔴 Missing |
| **Behaviors** | `dark-vessel` and `possible-transshipment` plugins (`server/src/behaviors/`) | Directory does not exist | 🔴 Missing |
| **Integrations** | GFW, AISStream, Open-Meteo, Gemini, Copernicus (`server/src/integrations/`) | Directory does not exist; only references in `config.js` and placeholder in `app.js` | 🔴 Missing |
| **Removed Integrations** | No Telegram, Email/SMTP, SMS, Web Push/VAPID | Config and initial SQL still contain references to VAPID, Telegram, SMTP, SMS | 🟡 Needs cleanup (Part A) |
| **Database Migrations** | `001_initial.sql` (updated to drop `push_subscriptions` and add `notifications`) | `001_initial.sql` has `push_subscriptions` and `alert_log`, lacks `notifications` | 🟡 Migration needed |
| **Server Endpoints** | `/healthz`, `/api/status`, `/api/stream`, `/api/cases`, `/api/objectives`, `/api/run` | Only `/healthz`, `/api/status`, and obsolete `/api/push/vapid-key` exist | 🔴 Partial |
| **Frontend UI** | MapLibre 3D Globe + Flat, Feed, Intel, Layers, Alerts Drawer, Objectives, Validation | Basic single-page React app (`Home.jsx`) using Leaflet placeholder | 🔴 Needs redesign |
| **Objectives Verification** | `/objectives`, `GET /api/objectives`, `npm run verify:objectives` | None exist | 🔴 Missing |
| **Deployment** | Render web service + PostgreSQL database configured | `render.yaml` exists; not yet deployed to live Render URL | 🟡 In progress |

---

## Detailed Component Audit

### 1. Agents (`server/src/agents/`)
- **Detection Agent**: Not implemented. Needs GFW SAR and AIS ingestion, spatial-temporal matching, sector calculation, and hashing.
- **Reasoning Agent**: Not implemented. Needs 10 operational features calculation, rule scoring (0-100), LLM adjustment (-15..+15) with schema validation, and fallback template.
- **Alert Agent**: Not implemented. Needs tactical brief generation, deduplication (10 km / 7 days), and publishing to on-site notifications channel.

### 2. Integrations (`server/src/integrations/`)
- `gfw.js`: Missing. Must connect to Global Fishing Watch API, verify dataset IDs (`public-global-sar-presence:latest`, etc.), and fetch real data.
- `aisstream.js`: Missing. Must maintain persistent WebSocket, handle reconnection with backoff, and save positions to `ais_positions`.
- `openmeteo.js`: Missing. Must query wave height and wind speed for detection coordinates.
- `llm.js`: Missing. Must wrap Google Gemini with structured JSON output and zod schema validation.
- `copernicus.js`: Missing. Must handle OAuth token and Sentinel Hub chip requests.

### 3. Cleanup of Removed External Channels (Change Request v3 Part A)
- **Dependencies**: Need to remove `web-push`, `nodemailer` from `server/package.json`.
- **Environment**: Remove `VAPID_*`, `TELEGRAM_*`, `SMTP_*`, `EMAIL_*`, `AT_*`, `ALERT_SMS_NUMBERS` from `.env.example`, `.env`, and `server/src/config.js`.
- **Render blueprint**: Remove these environment variables from `render.yaml`.
- **Database**: Add migration `002_onsite_notifications.sql` to drop `push_subscriptions` and create `notifications` table.

### 4. API Endpoints
- `GET /healthz`: Implemented and functional.
- `GET /api/status`: Implemented as placeholder; needs cleanup of removed integrations and live telemetry from agent runs.
- `GET /api/stream`: Not implemented. Needs Server-Sent Events (SSE) with 25s heartbeat and pub/sub.
- `GET /api/notifications`: Not implemented.
- `POST /api/notifications/test`: Not implemented (for system test notification).
- `GET /api/cases`, `GET /api/cases/:id`, `POST /api/cases/:id/action`: Not implemented.
- `GET /api/map`: Not implemented.
- `GET /api/objectives`: Not implemented.
- `POST /api/run`: Not implemented.

### 5. Frontend (`web/`)
- Currently includes Vite, React 19, and a basic status page.
- MapLibre GL JS needs to be installed in place of Leaflet.
- UI components required:
  - Header with live heartbeat, time-ago staleness, unread alert bell badge, Flat/Globe projection toggle.
  - Left navigation rail (Feed, Alerts, Ships, Zones, Insights, Validation, Status, Objectives).
  - MapLibre map with Kenya EEZ boundary and layers panel.
  - Case Intel panel with score chip, "Why flagged", feature chips, status timeline, and action buttons.
  - Notification drawer and toast system.

### 6. Deployment & Verification
- `render.yaml` exists with Node.js starter plan and Frankfurt region.
- Verification script `scripts/verify-objectives.js` and `npm run verify:objectives` to be built.
- `docs/COMPLIANCE.md` to be generated after live deployment.

---

## Action Plan
1. **Checkpoint A (Current)**: Audit complete. Report findings.
2. **Stage B**: Remove all outside channels, clean up configuration and dependencies, apply migration for on-site notifications.
3. **Stage C**: Implement on-site notification system (SSE endpoint, pub/sub, notifications table, system test).
4. **Stage D**: Implement agents, behavior plugins, integrations, and redesigned MapLibre UI (flat + 3D globe).
5. **Stage E**: Build objectives scorecard endpoint (`/api/objectives`) and UI page (`/objectives`), validation engine, and deploy to Render.
6. **Stage F**: Run automated verification against live URL, generate `docs/COMPLIANCE.md`, and resolve any discrepancies.
