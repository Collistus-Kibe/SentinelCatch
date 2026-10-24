import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getTranslation } from '../services/i18n.js';
import { getVesselPhoto, getFlagEmoji } from '../utils/vesselAssets.js';

// Self-contained Dark Ocean Style using ESRI World Dark Gray Canvas (No API key required)
const DARK_OCEAN_STYLE = {
  version: 8,
  name: 'SentinelCatch Maritime Dark Ocean',
  sources: {
    'esri-dark-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    },
    'esri-labels-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#080d1a',
      },
    },
    {
      id: 'esri-dark-base',
      type: 'raster',
      source: 'esri-dark-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'esri-labels-layer',
      type: 'raster',
      source: 'esri-labels-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export default function MapViewport({
  selectedCaseId,
  onSelectCase,
  cases = [],
  activeSector = 'all',
  language = 'en',
  flyToCoords = null,
}) {
  const t = getTranslation(language);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const [isGlobe, setIsGlobe] = useState(false);
  const [layersLoaded, setLayersLoaded] = useState(false);
  const popupRef = useRef(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState({
    eez: true,
    mpas: true,
    tracks: true,
    cases: true,
    ships: true,
    coverage: false,
    ports: true,
  });

  const [mapLayersData, setMapLayersData] = useState(null);

  // Fetch GeoJSON layers from /api/map/layers
  useEffect(() => {
    fetch('/api/map/layers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setMapLayersData(data);
      })
      .catch((err) => console.error('Failed to load map layers:', err));
  }, []);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DARK_OCEAN_STYLE,
      center: [41.2, -2.8], // Center of Kenya EEZ
      zoom: 6.2,
      minZoom: 4.8,
      maxZoom: 15.0,
      maxBounds: [
        [28.0, -12.5], // Southwest [lon, lat] (Tanzania / Mozambique channel / East Africa)
        [54.0, 7.5],   // Northeast [lon, lat] (Somali basin / Arabian sea / Seychelles)
      ],
      pitch: 22,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');

    map.on('error', (e) => {
      console.warn('MapLibre tile event:', e.error?.message || e);
    });

    // Dynamic zoom listener to collapse pins into compact beacons at lower zoom
    const handleZoom = () => {
      const z = map.getZoom();
      const isCompactNow = z < 7.2;
      const pinElements = mapContainerRef.current?.querySelectorAll('.tactical-map-pin');
      pinElements?.forEach((pin) => {
        const isSelected = pin.classList.contains('is-selected');
        if (!isSelected) {
          if (isCompactNow) {
            pin.classList.add('compact-beacon');
          } else {
            pin.classList.remove('compact-beacon');
          }
        } else {
          pin.classList.remove('compact-beacon');
        }
      });
    };

    map.on('zoom', handleZoom);

    map.on('load', () => {
      mapRef.current = map;
      setLayersLoaded(true);
      map.resize();
    });

    const resizeTimer = setTimeout(() => {
      map.resize();
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Projection switch: Flat (Mercator) vs 3D Globe
  const toggleProjection = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextIsGlobe = !isGlobe;
    setIsGlobe(nextIsGlobe);

    try {
      if (typeof map.setProjection === 'function') {
        map.setProjection({
          type: nextIsGlobe ? 'globe' : 'mercator',
        });
      }
    } catch (err) {
      console.warn('Globe projection switch note:', err);
    }
  }, [isGlobe]);

  // Add / Update Base GeoJSON Layers (EEZ, MPAs, Ports, AIS Ships)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded || !mapLayersData) return;

    if (!map.getSource('sentinelcatch-data')) {
      map.addSource('sentinelcatch-data', {
        type: 'geojson',
        data: mapLayersData,
      });

      // EEZ Fill & Line
      map.addLayer({
        id: 'eez-fill',
        type: 'fill',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'id'], 'kenya-eez'],
        paint: {
          'fill-color': '#06b6d4',
          'fill-opacity': 0.08,
        },
      });

      map.addLayer({
        id: 'eez-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'id'], 'kenya-eez'],
        paint: {
          'line-color': '#06b6d4',
          'line-width': 2.5,
          'line-dasharray': [4, 2],
        },
      });

      // Marine Protected Areas (MPAs)
      map.addLayer({
        id: 'mpas-fill',
        type: 'fill',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.22,
        },
      });

      map.addLayer({
        id: 'mpas-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        paint: {
          'line-color': '#34d399',
          'line-width': 2,
        },
      });

      // AIS Coverage Grid
      map.addLayer({
        id: 'coverage-fill',
        type: 'fill',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'ais_coverage'],
        layout: {
          visibility: visibleLayers.coverage ? 'visible' : 'none',
        },
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': ['*', ['get', 'confidence'], 0.15],
          'fill-outline-color': 'rgba(59, 130, 246, 0.3)',
        },
      });

      // Ports
      map.addLayer({
        id: 'ports-circle',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'port'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#94a3b8',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#f8fafc',
        },
      });

      // Live AIS Ships
      map.addLayer({
        id: 'ships-circle',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'ais_ship'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#38bdf8',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#0284c7',
        },
      });

      // ── Vessel Route Trajectories (Each Ship with Distinct Color) ──
      // 1. Neon Glow Layer (Halo blur behind the track line)
      map.addLayer({
        id: 'tracks-glow',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'vessel_track'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['==', ['get', 'caseId'], selectedCaseId || -1],
            10,
            6,
          ],
          'line-opacity': [
            'case',
            ['==', ['get', 'caseId'], selectedCaseId || -1],
            0.7,
            0.3,
          ],
          'line-blur': 4,
        },
      });

      // 2. Crisp Route Vector Line
      map.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'vessel_track'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['==', ['get', 'caseId'], selectedCaseId || -1],
            4.6,
            2.6,
          ],
          'line-opacity': 0.95,
        },
      });

      // 3. Historical Waypoints along the Route
      map.addLayer({
        id: 'tracks-waypoints',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'vessel_track_waypoint'],
        layout: {
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isGapPoint'],
            7,
            ['get', 'isCurrent'],
            6,
            ['get', 'isOrigin'],
            5,
            3.5,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#080d1a',
          'circle-opacity': 0.95,
        },
      });

      // Interactive hover & click on track lines
      map.on('mouseenter', 'tracks-line', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        }
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="track-popup-card" style="border-left: 4px solid ${props.color}">
              <div class="track-popup-title">${props.flagEmoji || '🚢'} <strong>${props.vesselName}</strong></div>
              <div class="track-popup-meta">
                <span>📏 Traversed: <strong>${props.totalDistanceNm} nm</strong></span>
                <span>⏱️ Window: <strong>${props.totalDurationHours}h</strong></span>
              </div>
              ${props.aisGapHoursAgo ? `<div class="track-popup-gap">⚠️ Transponder Ceased: <strong>${props.aisGapHoursAgo}h ago</strong></div>` : ''}
              <div class="track-popup-hint">Click line to inspect case intel</div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'tracks-line', () => {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) popupRef.current.remove();
      });

      map.on('click', 'tracks-line', (e) => {
        const caseId = e.features?.[0]?.properties?.caseId;
        if (caseId) {
          onSelectCase(Number(caseId));
        }
      });

      // Interactive hover on waypoints
      map.on('mouseenter', 'tracks-waypoints', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
        }
        const coords = e.features[0].geometry.coordinates;
        popupRef.current
          .setLngLat(coords)
          .setHTML(`
            <div class="waypoint-popup-card" style="border-top: 3px solid ${props.color}">
              <div class="wp-title"><strong>${props.vesselName}</strong></div>
              <div class="wp-label">${props.label}</div>
              <div class="wp-meta">⏱️ ${props.hoursAgo === 0 ? 'Current Position' : `${props.hoursAgo}h ago`} · ⚡ ${props.speedKnots} kn · 🧭 ${props.heading}°</div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'tracks-waypoints', () => {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) popupRef.current.remove();
      });
    } else {
      map.getSource('sentinelcatch-data').setData(mapLayersData);
    }
  }, [layersLoaded, mapLayersData, visibleLayers.coverage, visibleLayers.tracks, selectedCaseId, onSelectCase]);

  // Update visibility of vector layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) return;

    const setVis = (layerId, show) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', show ? 'visible' : 'none');
      }
    };

    setVis('eez-fill', visibleLayers.eez);
    setVis('eez-line', visibleLayers.eez);
    setVis('mpas-fill', visibleLayers.mpas);
    setVis('mpas-line', visibleLayers.mpas);
    setVis('tracks-glow', visibleLayers.tracks);
    setVis('tracks-line', visibleLayers.tracks);
    setVis('tracks-waypoints', visibleLayers.tracks);
    setVis('ships-circle', visibleLayers.ships);
    setVis('coverage-fill', visibleLayers.coverage);
    setVis('ports-circle', visibleLayers.ports);
  }, [visibleLayers, layersLoaded]);

  // Highlight selected vessel's route when selectedCaseId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) return;

    if (map.getLayer('tracks-glow')) {
      map.setPaintProperty('tracks-glow', 'line-width', [
        'case',
        ['==', ['get', 'caseId'], selectedCaseId || -1],
        11,
        6,
      ]);
      map.setPaintProperty('tracks-glow', 'line-opacity', [
        'case',
        ['==', ['get', 'caseId'], selectedCaseId || -1],
        0.75,
        0.28,
      ]);
    }

    if (map.getLayer('tracks-line')) {
      map.setPaintProperty('tracks-line', 'line-width', [
        'case',
        ['==', ['get', 'caseId'], selectedCaseId || -1],
        4.8,
        2.6,
      ]);
    }
  }, [selectedCaseId, layersLoaded]);

  // Render Custom Tactical Vessel Pins on the Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Only render pins if the detections layer is toggled on
    if (!visibleLayers.cases || !cases || cases.length === 0) return;

    const filteredCases = cases.filter((c) => {
      if (activeSector && activeSector !== 'all' && c.sector !== activeSector) {
        return false;
      }
      return true;
    });

    filteredCases.forEach((c) => {
      const lat = c.features?.lat ?? c.lat;
      const lon = c.features?.lon ?? c.lon;
      if (lat === undefined || lon === undefined) return;

      const isSelected = selectedCaseId === c.id;
      const currentMapZoom = map.getZoom ? map.getZoom() : 6.2;
      const isCompact = currentMapZoom < 7.2 && !isSelected;
      const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || null;
      const vesselName = candidate?.vesselName || 'Unidentified Dark Contact';
      const flagEmoji = getFlagEmoji(candidate?.flag || '');
      const vesselPhoto = getVesselPhoto(vesselName, candidate?.gearType || '');
      const band = (c.band || 'High').toUpperCase();
      const score = c.score_final ?? 85;
      const matchPct = candidate?.confidencePct || 85;
      const locLabel = c.features?.locationLabel || c.sector || 'Kenya Waters';
      const inMPA = Boolean(c.features?.inMPA);
      const isIUU = Boolean(candidate?.iuuListed);

      // Create custom DOM element for tactical pin
      const el = document.createElement('div');
      el.className = `tactical-map-pin ${isSelected ? 'is-selected' : ''} ${isCompact ? 'compact-beacon' : ''} band-${(c.band || 'high').toLowerCase()}`;
      el.setAttribute('data-case-id', c.id);

      el.innerHTML = `
        <!-- Compact Tactical Beacon (Rendered at low zoom levels) -->
        <div class="pin-beacon-chip">
          <span class="beacon-flag">${flagEmoji}</span>
          <span class="beacon-score ${(c.band || 'high').toLowerCase()}">${score}</span>
          <span class="beacon-name">${vesselName.length > 14 ? vesselName.slice(0, 13) + '…' : vesselName}</span>
          <span class="beacon-pulse-dot"></span>
        </div>

        <!-- Full Recon Photo Card Bubble -->
        <div class="pin-card-bubble">
          <div class="pin-photo-header">
            <img src="${vesselPhoto}" alt="${vesselName}" class="pin-vessel-img" loading="lazy" />
            <div class="pin-band-chip ${(c.band || 'high').toLowerCase()}">
              <span class="chip-pulse-dot"></span>
              ${band} · ${score}
            </div>
            ${isIUU ? '<span class="pin-iuu-badge">⚠️ IUU LISTED</span>' : ''}
            ${inMPA ? '<span class="pin-mpa-badge">🌿 IN MPA</span>' : ''}
          </div>
          <div class="pin-details-body">
            <div class="pin-title-row">
              <span class="pin-flag-icon">${flagEmoji}</span>
              <span class="pin-vessel-title" title="${vesselName}">${vesselName}</span>
            </div>
            <div class="pin-meta-row">
              <span class="pin-loc-text">📍 ${locLabel}</span>
              <span class="pin-match-chip">🎯 ${matchPct}% match</span>
            </div>
            ${isSelected ? `
              <div class="pin-selected-indicator">
                <span class="sel-pulse-dot"></span>
                <span class="sel-text">ACTIVE TARGET · INTEL OPEN</span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="pin-pointer-stem">
          <div class="stem-line"></div>
          <div class="stem-arrow"></div>
        </div>
        <div class="pin-water-target">
          <div class="water-ripple ring-1"></div>
          <div class="water-ripple ring-2"></div>
          <div class="water-crosshair"></div>
        </div>
      `;

      // Click to select case and center smoothly
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectCase(c.id);
        map.flyTo({
          center: [lon, lat],
          zoom: 9.8,
          pitch: 35,
          essential: true,
          duration: 1200,
        });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([lon, lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [cases, activeSector, selectedCaseId, visibleLayers.cases, layersLoaded, onSelectCase]);

  // Fly to coordinates when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCoords) return;

    map.flyTo({
      center: [flyToCoords.lon, flyToCoords.lat],
      zoom: 9.8,
      pitch: 35,
      essential: true,
      duration: 1400,
    });
  }, [flyToCoords]);

  // Extract vessel tracks for interactive legend & track zoom
  const trackList = (mapLayersData?.features || [])
    .filter((f) => f.properties?.type === 'vessel_track')
    .map((f) => ({
      caseId: f.properties.caseId,
      vesselName: f.properties.vesselName,
      flagEmoji: f.properties.flagEmoji,
      gearType: f.properties.gearType,
      color: f.properties.color,
      colorName: f.properties.colorName,
      totalDistanceNm: f.properties.totalDistanceNm,
      totalDurationHours: f.properties.totalDurationHours,
      coordinates: f.geometry.coordinates,
    }));

  const flyToTrack = useCallback((track) => {
    const map = mapRef.current;
    if (!map || !track?.coordinates?.length) return;
    const coords = track.coordinates;
    let minLon = coords[0][0], maxLon = coords[0][0];
    let minLat = coords[0][1], maxLat = coords[0][1];
    coords.forEach(([lon, lat]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
    map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
      padding: { top: 90, bottom: 90, left: 90, right: 90 },
      maxZoom: 9.5,
      duration: 1400,
    });
  }, []);

  return (
    <div className="map-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Modern HUD Projection & Layer Controls Toolbar */}
      <div className="map-overlay-controls">
        <button
          className={`btn-projection ${isGlobe ? 'btn-active' : ''}`}
          onClick={toggleProjection}
          title={t.projectionTooltip}
          id="toggle-projection-btn"
        >
          {isGlobe ? `🌐 ${t.projectionGlobe}` : `🗺️ ${t.projectionFlat}`}
        </button>

        {/* Quick Layer Visibility Toggles */}
        <div className="layer-pill-group">
          <label className={`layer-pill ${visibleLayers.eez ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.eez}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, eez: e.target.checked }))}
            />
            🛡️ EEZ
          </label>
          <label className={`layer-pill ${visibleLayers.mpas ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.mpas}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, mpas: e.target.checked }))}
            />
            🌿 MPAs
          </label>
          <label className={`layer-pill ${visibleLayers.tracks ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.tracks}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, tracks: e.target.checked }))}
            />
            〰️ Vessel Routes
          </label>
          <label className={`layer-pill ${visibleLayers.cases ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.cases}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, cases: e.target.checked }))}
            />
            🚨 Vessel Pins
          </label>
          <label className={`layer-pill ${visibleLayers.ships ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.ships}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, ships: e.target.checked }))}
            />
            🚢 Live AIS
          </label>
          <label className={`layer-pill ${visibleLayers.coverage ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.coverage}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, coverage: e.target.checked }))}
            />
            📶 AIS Grid
          </label>
        </div>
      </div>

      {/* Floating Tactical Vessel Routes Legend (Distinct Color & Line per Ship) */}
      {visibleLayers.tracks && trackList.length > 0 && (
        <div className={`map-vessel-legend ${legendCollapsed ? 'collapsed' : ''}`}>
          <div className="legend-header" onClick={() => setLegendCollapsed((p) => !p)}>
            <div className="legend-header-left">
              <span className="legend-pulse-dot"></span>
              <span className="legend-title">Vessel Route Tracks ({trackList.length})</span>
            </div>
            <button className="legend-toggle-btn" title="Toggle Legend" type="button">
              {legendCollapsed ? '▲ Expand' : '▼ Minimize'}
            </button>
          </div>
          {!legendCollapsed && (
            <div className="legend-items-list">
              {trackList.map((tr) => (
                <div
                  key={tr.caseId}
                  className={`legend-item-row ${selectedCaseId === tr.caseId ? 'is-active' : ''}`}
                  onClick={() => {
                    onSelectCase(tr.caseId);
                    flyToTrack(tr);
                  }}
                  title={`Trace back ${tr.vesselName} route (${tr.totalDistanceNm} nm)`}
                >
                  <span
                    className="legend-color-bar"
                    style={{
                      backgroundColor: tr.color,
                      boxShadow: `0 0 10px ${tr.color}`,
                    }}
                  />
                  <span className="legend-vessel-name">
                    {tr.flagEmoji} {tr.vesselName}
                  </span>
                  <span className="legend-distance-tag">{tr.totalDistanceNm} nm</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
