# SentinelCatch Integration Notes

This document records findings from actual API testing against third-party services.
**No endpoints, parameters, or response fields are assumed — all are verified.**

## Integration Status (Part E Active Integrations)

| Integration | Required / Optional | Verified | Status |
|---|---|---|---|
| Global Fishing Watch (GFW) API | **Required** | ⏳ In progress | Ingesting Sentinel-1 SAR & AIS data |
| Google Gemini LLM API | **Required** | ⏳ In progress | Structured JSON scoring adjustments & rationales |
| PostgreSQL Database | **Required** | ⏳ Verified locally | Schemas, migrations & advisory lock |
| AISStream.io WebSocket | Recommended | ⏳ In progress | Live ship positions & coverage estimation |
| Open-Meteo Marine API | Built-in (No key) | ⏳ In progress | Wave height & wind speed |
| Copernicus Data Space Ecosystem | Optional | ⏳ Pending | Satellite evidence chips |
| MapLibre / Basemap Provider | Open / Free | ⏳ Verified | CARTO Dark Matter GL style |

*Note: All external broadcast channels (Telegram, Email/SMTP, SMS, Web Push/VAPID) have been permanently removed per Change Request v3 in favor of on-site Server-Sent Events (SSE).*

---

## 1. Global Fishing Watch (GFW) API

**Registration**: https://globalfishingwatch.org/our-apis  
**Documentation**: https://api-doc.globalfishingwatch.org  

### Endpoints & Datasets to Verify:
1. `public-global-sar-presence:latest`: Satellite SAR vessel detections.
2. `public-global-presence:latest`: AIS vessel presence.
3. `public-global-gaps-events:latest`: AIS signal gaps (vessels going dark).
4. `public-global-loitering-events:latest`: Loitering behavior.
5. `public-global-encounters-events:latest`: Two vessels meeting at sea.
6. `public-global-fishing-effort:latest`: Apparent fishing hours.
7. `public-global-port-visits-events:latest`: In/out port events.
8. Regions API: Kenya EEZ ISO3 `KEN` or numeric ID.

### Operational Questions to Record:
- Are SAR detections returned as exact point coordinates or raster grid cells?
- If grid cells, centroid latitude/longitude and cell bounding radius for the location uncertainty circle.
- How to separate AIS-matched SAR detections from unmatched radar reflections in the response payload.
- Data latency (how many hours/days lag between radar pass and API availability).

---

## 2. AISStream.io

**Registration**: https://aisstream.io  
**Documentation**: https://aisstream.io/documentation  
**Protocol**: Secure WebSocket (`wss://stream.aisstream.io/v0/stream`)

### Kenya EEZ Bounding Box:
```json
{
  "Apikey": "<AISSTREAM_API_KEY>",
  "BoundingBoxes": [
    [
      [-4.75, 39.0],
      [0.5, 45.5]
    ]
  ],
  "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
}
```

### Operational Behavior:
- Auto-reconnect with exponential backoff (1s, 2s, 4s, ..., up to 60s).
- Positions stored in `ais_positions` with 72-hour TTL.
- Automatic background pruning of expired positions.

---

## 3. Open-Meteo Marine API

**Documentation**: https://open-meteo.com/en/docs/marine-weather-api  
**Endpoint**: `https://marine-api.open-meteo.com/v1/marine`  
**Authentication**: None required (free non-commercial open data).

### Query Parameters:
- `latitude`: Float
- `longitude`: Float
- `hourly`: `wave_height,wind_wave_height,wave_period`
- `timezone`: `UTC`

### Usage:
- Rough seas (wave height > 2.5m) decrease radar backscatter contrast and reduce detection confidence. Factored into rule scoring and displayed on case cards.

---

## 4. Google Gemini API

**Key**: https://aistudio.google.com/apikey  
**Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`  
**Model**: `gemini-2.5-flash` (or user-configurable via `LLM_MODEL`)

### Output Contract:
Enforce structured JSON output matching Zod schema:
```typescript
{
  score_adjustment: number; // Clamped between -15 and +15
  rationale: string;        // 2-3 plain-language sentences citing only provided facts
  key_factors: string[];    // Array of key drivers
}
```

### Fallback Policy:
If API times out, returns HTTP error, or outputs unparseable JSON, the Reasoning Agent falls back to a deterministic rule-based template built from the computed features.

---

## 5. Copernicus Data Space Ecosystem (Sentinel Hub)

**Registration**: https://dataspace.copernicus.eu  
**Documentation**: https://documentation.dataspace.copernicus.eu  
**Authentication**: OAuth2 Client Credentials (`COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET`)

### Usage:
- Fetches small radar (Sentinel-1) or optical (Sentinel-2) image chips centered on high-confidence cases.
- Graceful degradation: if credentials are not provided or API limit is reached, evidence panel displays vector radar metrics without imagery.

---

## 6. MapLibre / Basemap Provider

- **Default Basemap**: CARTO Dark Matter (`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`)
- **Attribution**: "© OpenStreetMap contributors, © CARTO"
- **Terms**: Free for public web use with standard attribution.
- **Alternative**: Optional `MAPTILER_KEY` for MapTiler vector styles.
