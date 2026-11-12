# SentinelCatch — Pitch Deck Presentation Content
> **Subtitle:** Empowering Kenyan Maritime Enforcement with Zero-License Satellite Intelligence  
> **Event:** Inter-University Hackathon Finals  
> **Track:** Blue Economy, Maritime Domain Awareness & AI-Driven Security  
> **Live Platform:** [https://sentinelcatch.onrender.com](https://sentinelcatch.onrender.com)  

---

## Slide 1: Introduction Slide

### Title & Visual Hook
- **Project Name:** SentinelCatch
- **Subtitle:** Empowering Kenyan Maritime Enforcement with Zero-License Satellite Intelligence
- **Tagline:** *Tactical maritime domain awareness in the palm of every patrol officer’s hand.*

### Team Presentation
- **Institution / University Affiliation:** [Insert University / Institute Name]
- **Team Name:** [Insert Team Name]

| Team Member | Role | Key Contributions |
| :--- | :--- | :--- |
| **[Member 1 Name]** | Team Lead & Full-Stack Architect | System architecture, PWA implementation, MapLibre WebGL integration, TiDB cloud setup |
| **[Member 2 Name]** | AI & Geospatial Engineer | SAR radar processing, GFW API integration, multi-agent AI risk scoring (Gemini + OpenAI) |
| **[Member 3 Name]** | Maritime Domain & UI/UX Specialist | Handheld tactical interface, officer patrol workflow, RFMO/IUU database modeling |
| **[Member 4 Name]** | Backend & Infrastructure Lead | Server-Sent Events (SSE) live pipeline, mobile push alerts, real-time station mesh |

---

## Slide 2: Problem Statement

### The Reality in Kenya’s Waters
Kenya commands an Exclusive Economic Zone (EEZ) spanning **142,400 km²** along a **640 km coastline**, guarding critical global shipping lanes and rich pelagic fisheries. Yet, coastal enforcement faces severe structural blindspots:

1. **Officers Lack Dedicated, Accessible Handheld Technology:**
   - Field officers of the Kenya Coast Guard Service (KCGS) and Kenya Fisheries Service (KeFS) operate on rigid inflatable boats (RIBs) and remote outposts with no tactical software.
   - Current systems are locked in air-conditioned headquarters on expensive enterprise desktops, relying on radio hearsay to direct intercept boats.

2. **Standard Systems Fail the Moment an Illegal Vessel Goes "Dark":**
   - 94% of non-compliant foreign industrial fishing vessels deliberately disable their Automatic Identification System (AIS) transponders 20–50 km before entering Kenya's sovereign waters.
   - Standard tracking tools (MarineTraffic, VesselFinder) simply show an empty ocean when transponders are powered down, leaving Marine Protected Areas (MPAs like Kiunga and Kisite-Mpunguti) defenceless.

3. **Devastating Economic & Ecological Toll:**
   - Kenya loses an estimated **KSh 12 to 15 Billion ($100M+ USD)** annually to Illegal, Unreported, and Unregulated (IUU) fishing.
   - Depleted inshore fish stocks undermine the livelihoods of over 2 million coastal residents and collapse local marine ecosystems.

---

## Slide 3: The Solution — SentinelCatch

### What is SentinelCatch?
A **handheld-first, zero-license tactical maritime intelligence web application (PWA)** that puts real-time satellite surveillance into the hands of Kenyan patrol officers on their existing smartphones and patrol laptops.

### How It Works:
- **Penetrating the Darkness with Synthetic Aperture Radar (SAR):** When a vessel turns off AIS, European Space Agency (ESA) Sentinel-1 radar satellites pierce cloud cover, rain, and darkness to locate the vessel's physical metal hull.
- **Correlating Unidentified Radar Contacts:** Cross-references radar detections with Global Fishing Watch (GFW) history, historical AIS trajectories, and RFMO IUU blacklists (Trygg Mat Tracking).
- **Device-Agnostic PWA Deployment:** Runs directly in any mobile browser with zero app-store barriers, automatically locking into an intuitive **Tactical Landscape Game-Mode HUD** with offline caching.
- **Local Station Mesh:** Connects officers to their assigned coastal base (Lamu `LAM-01`, Mombasa `MBA-01`, Malindi `MAL-01`, Shimoni `SHI-01`) to share real-time vessel alerts, live patrol chat, and coordinated dispatches.

---

## Slide 4: Target Users & Beneficiaries

### Primary Users (Field Operators)
- **Kenya Coast Guard Service (KCGS):** Tactical commanders, patrol boat crews, and boarding inspection teams.
- **Kenya Fisheries Service (KeFS):** Fisheries monitoring, control, and surveillance (MCS) inspectors.
- **Kenya Navy (KN):** Coastal surveillance units and fast-attack intercept squadrons.

### Secondary Beneficiaries (Local Guardians)
- **Kenya Wildlife Service (KWS) Marine Rangers:** Monitoring Marine Protected Areas (Kiunga Marine Reserve, Malindi-Watamu Marine National Park, Kisite-Mpunguti).
- **Beach Management Units (BMUs):** Artisanal coastal fishermen whose livelihoods are protected from illegal industrial trawler incursions.

### Strategic Stakeholders
- Ministry of Mining, Blue Economy, and Maritime Affairs.
- Indian Ocean Commission (IOC) Regional Fisheries Monitoring Plan (PRSP).

---

## Slide 5: Product Features & Value Chain

### Core Features Demonstrated in Live Prototype
1. **Interactive Tactical Surveillance Map:** High-performance MapLibre WebGL basemap rendering sovereign EEZ limits, 12nm territorial waters, and neon-highlighted MPAs.
2. **Forensic Provenance & Trace-Back:** Traces trans-oceanic routes of distant-water fleets back thousands of nautical miles to departure ports (Zhoushan, Kaohsiung, Freetown, Colombo).
3. **Verified Photographic Dossier:** Instant 1-click suspect dossier complete with authentic naval telephoto photography, IMO/MMSI identifiers, flag-of-convenience analysis, and past international convictions.
4. **Decoupled Pin & Intel Dossier:** Click a chevron on water to view GPS coordinates and speed; tap *"Inspect Dossier"* to smoothly open full intelligence without cluttering the screen.
5. **Station Patrol Live Chat:** Encrypted base-scoped messaging channel allowing officers at the same base to coordinate sweeps and boarding dispatches in real-time.
6. **Distance-Aware Push Alerts:** ServiceWorker notifications with mobile vibration patterns displaying exact distance in Nautical Miles (NM) from the officer's command base.

### Operational Value Chain
```
[Sentinel-1 SAR Radar / AIS Stream]
                │
                ▼
[SentinelCatch Autonomous Reasoning Agent]
  - Calculates Threat Score (0–100)
  - Evaluates Incursions into MPAs / EEZ
  - Identifies Dark Vessel Candidate Matches
                │
                ▼
[Real-Time SSE Broadcast & TiDB Storage]
                │
                ▼
[Officer Smartphone / Laptop PWA]
  - Native Vibration Alert (e.g., "⚠️ High Threat: 18.4 NM from Lamu")
  - One-Click GPS Coordinate Copy for Boarding Intercept
  - Automated WhatsApp / Incident Report Dossier Dispatch
```

---

## Slide 6: Technical Stack & System Architecture

### Frontend (Client-Side)
- **Framework:** React 18 + Vite (bundled for fast, lightweight mobile performance).
- **Mapping Engine:** MapLibre GL WebGL with hardware-accelerated Esri Satellite and Dark Nautical raster pipelines.
- **PWA Infrastructure:** Custom Service Worker (`sw.js`) with network-first strategy, CORS-isolated WebGL texture bypass, and app install manifest.

### Backend & Live Feed
- **Runtime:** Node.js + Express REST API.
- **Real-Time Streaming:** Server-Sent Events (SSE) pipeline pushing millisecond-latency tactical updates without battery-draining polling.

### Database & Security
- **Cloud Database:** TiDB Cloud (distributed MySQL-compatible database providing high availability, transaction security, and low latency for patrol dispatches and station rosters).
- **Role-Based Auth:** Field officer credential gate tying officer service IDs to assigned command stations.

### AI Multi-Agent Reasoning Engine
- **Hybrid Multi-Agent AI:** Google Gemini 2.5 Flash + OpenAI GPT-4o-mini with auto-failover, assessing satellite kinematics, speed anomalies, gear configurations, and historical RFMO convictions.

---

## Slide 7: Competitors & Unique Value Proposition (UVP)

### Competitive Matrix

| Capability / Attribute | Spire / HawkEye 360 | MarineTraffic / VesselFinder | Windward (Enterprise) | **SentinelCatch (Ours)** |
| :--- | :--- | :--- | :--- | :--- |
| **Annual Cost** | $25,000 – $60,000+ | Freemium / $1,200 | $35,000+ | **Zero-License / Open-Data** |
| **Hardware Requirement** | Operations Room Desktops | Desktop / Basic Web | Intelligence Suite | **Pocket Smartphones + Laptops** |
| **Dark Vessel Detection** | Yes (RF Emitter) | ❌ Fails when AIS off | Yes (Proprietary AI) | **Yes (Free Sentinel-1 SAR)** |
| **Mobile PWA & Game-Mode** | ❌ No | Basic Responsive | ❌ No | **✅ Built for Patrol RIBs** |
| **Station Patrol Mesh & Chat**| ❌ No | ❌ No | ❌ No | **✅ Real-Time Station Mesh** |
| **Incident Dossier Generation**| Manual export | ❌ No | Enterprise Reports | **✅ Instant 1-Click WhatsApp/Dossier**|

### Unique Value Proposition (UVP)
> *"SentinelCatch delivers enterprise-grade, dark-vessel maritime domain awareness directly into the hands of frontline Kenyan coastal officers using free open-access satellite radar and zero-license architecture."*

---

## Slide 8: Business Model & Sustainability

### Sustainable Public-Sector Deployment
1. **Government Partnership (B2G):**
   - Annual maintenance, operational support, and custom tactical layer customization for the Kenya Coast Guard Service and State Department for Fisheries.
2. **Multilateral Grant Funding & Development Programs:**
   - Sponsored deployments via Blue Economy development funds: World Bank KEMFSED (Kenya Marine Fisheries and Socio-Economic Development Project), EU Maritime Security (MASE), and UNODC Global Maritime Crime Programme.
3. **Specialized Sensor Integration Services:**
   - Upgrades for integrating local coastal radar towers (KPA coastal radar, AIS shore stations) and patrol drone feeds into the unified SentinelCatch COP (Common Operating Picture).

---

## Slide 9: Target Market: TAM, SAM, SOM

### Market Opportunity
- **Total Addressable Market (TAM):** **$4.2 Billion**  
  *Global Maritime Domain Awareness (MDA), Fishery Surveillance, and Coastal Security Technology market.*
- **Serviceable Available Market (SAM):** **$280 Million**  
  *Sub-Saharan African and Western Indian Ocean (WIO) coastal states (Kenya, Tanzania, Mozambique, Madagascar, Seychelles, Mauritius, Comoros).*
- **Serviceable Obtainable Market (SOM):** **$3.5 Million**  
  *Kenya maritime enforcement deployment (KCGS, KeFS, KWS Marine Parks, and County Marine Police units) across a 3-year phased rollout.*

---

## Slide 10: Project Limitations & Challenges

### Transparent Constraints & Mitigations
1. **Satellite Revisit Frequency (Cadence):**
   - *Limitation:* Free Sentinel-1 SAR satellites pass every 1 to 3 days over equatorial East Africa.
   - *Mitigation:* Multi-sensor fusion blending live AIS streams, historical dead-reckoning trajectory models, and coastal transshipment rendezvous predictions.
2. **Offshore Cellular Data Connectivity:**
   - *Limitation:* 4G signals drop beyond 12–15 nautical miles from the shoreline.
   - *Mitigation:* Progressive Web App (PWA) offline storage saves active targets and coordinate caches locally; auto-synchronizes dispatches the instant a patrol craft re-enters cellular range.
3. **False Positive Screening:**
   - *Limitation:* Radar returns from sea clutter or small artisanal dhows.
   - *Mitigation:* Multi-criteria AI deliberation verifying vessel length (meters), speed (knots), and radar cross-section before escalating alert status.

---

## Slide 11: Future Roadmap

- **Phase 1 (Immediate / Q1 2027):** Operational sea trials with KCGS Lamu Archipelago Command (`LAM-01`) and KWS Kiunga Marine Reserve.
- **Phase 2 (Q2–Q3 2027):** Integration with commercial high-cadence satellite constellations (Spire, Planet SkySat) and local surveillance drone video streams.
- **Phase 3 (Q4 2027):** Long-Range LoRaWAN Coastal Mesh connecting solar-powered offshore buoys for acoustic hydrophone fish-bombing detection.
- **Phase 4 (2028):** Regional integration with the Regional Maritime Information Fusion Centre (RMIFC) in Madagascar for cross-border Indian Ocean tracking.

---

## Slide 12: The Ask

To transition SentinelCatch from a functional hackathon prototype to an active coastal defense system, we are seeking:

1. **Operational Sea Trial Access:** Direct endorsement to conduct pilot field tests alongside KCGS patrol craft at the Mombasa or Lamu coastal bases.
2. **Cloud & Satellite Compute Credits:** $10,000 in cloud infrastructure (Render / AWS / TiDB Cloud) and access to high-cadence Copernicus radar APIs.
3. **Technical & Naval Mentorship:** Access to maritime domain specialists and naval legal experts to refine evidentiary standards for court-admissible IUU prosecutions.
4. **Seed Grant Funding:** **$25,000** to fund 6 months of field validation, ruggedized patrol testing devices, and officer training workshops.

---

## Slide 13: Thank You & Q&A

### SentinelCatch
**Defending Kenya’s Blue Economy — From Satellite Orbit to Officer’s Pocket.**

- **Platform URL:** [https://sentinelcatch.onrender.com](https://sentinelcatch.onrender.com)
- **Email:** team@sentinelcatch.org / [insert primary contact email]
- **Repository:** [GitHub Repository Link]
- **Location:** Nairobi / Mombasa, Kenya

*Thank you to the Judges, Mentors, and Organizers of the Inter-University Hackathon. We welcome your questions!*

