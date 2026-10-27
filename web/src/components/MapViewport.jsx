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
  activeView = 'tactical',
  language = 'en',
  flyToCoords = null,
}) {
  const t = getTranslation(language);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const [layersLoaded, setLayersLoaded] = useState(false);
  const popupRef = useRef(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [showRoutesPanel, setShowRoutesPanel] = useState(true);
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

  // Initialize MapLibre in a stable, fixed 3D perspective focused on Kenya EEZ & East Africa
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DARK_OCEAN_STYLE,
      center: [41.25, -3.15], // Centers Kenya EEZ fairway from Kiunga to Shimoni
      zoom: 6.8,
      minZoom: 4.8,
      maxZoom: 15.0,
      maxBounds: [
        [28.0, -12.5], // Southwest [lon, lat] (East Africa coast)
        [54.0, 7.5],   // Northeast [lon, lat] (Somali basin / Arabian sea)
      ],
      pitch: 24, // Fixed military God's Eye 3D perspective
      bearing: 0, // Strict North-up tactical orientation
      dragRotate: false, // Lock rotation to prevent map spinning or disorienting angle tilt
      touchPitch: false, // Lock pitch on touch/mobile
      maxPitch: 26,
      minPitch: 20,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');

    map.on('error', (e) => {
      console.warn('MapLibre tile event:', e.error?.message || e);
    });

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

  // Reset to full Kenya EEZ fairway view
  const resetToFairway = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [41.25, -3.15],
      zoom: 6.8,
      pitch: 24,
      bearing: 0,
      essential: true,
      duration: 1200,
    });
  }, []);

  // When activeView switches to 'traceback', automatically frame the full oceanic route of the active case
  useEffect(() => {
    if (activeView !== 'traceback' || !mapRef.current || !layersLoaded) return;
    const tracks = (mapLayersData?.features || []).filter((f) => f.properties?.type === 'vessel_track');
    const targetTrack = tracks.find((t) => t.properties.caseId === selectedCaseId) || tracks[0];
    if (targetTrack?.geometry?.coordinates?.length) {
      const coords = targetTrack.geometry.coordinates;
      let minLon = coords[0][0], maxLon = coords[0][0];
      let minLat = coords[0][1], maxLat = coords[0][1];
      coords.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
      mapRef.current.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
        padding: { top: 90, bottom: 90, left: 90, right: 90 },
        pitch: 24,
        bearing: 0,
        duration: 1200,
      });
    }
  }, [activeView, selectedCaseId, layersLoaded, mapLayersData]);

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

      // Sovereign 12 nm Territorial Sea Boundary (UNCLOS)
      map.addLayer({
        id: 'territorial-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'territorial_boundary'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 1.8,
          'line-dasharray': [3, 2],
          'line-opacity': 0.8,
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

      // Ports Circles
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

      // Ports Tactical Name Labels
      map.addLayer({
        id: 'ports-label',
        type: 'symbol',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'port'],
        layout: {
          'text-field': ['concat', '⚓ ', ['get', 'name']],
          'text-size': 11,
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#f1f5f9',
          'text-halo-color': '#080d1a',
          'text-halo-width': 2.5,
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

      // 3. Historical Intermediate Waypoints along the Route
      map.addLayer({
        id: 'tracks-waypoints',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['all',
          ['==', ['get', 'type'], 'vessel_track_waypoint'],
          ['!=', ['get', 'isOrigin'], true],
          ['!=', ['get', 'isCurrent'], true],
        ],
        layout: {
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isGapPoint'],
            6,
            3.5,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#080d1a',
          'circle-opacity': 0.95,
        },
      });

      // 4. Origin Markers (▶ START - First satellite/radar contact in high seas)
      map.addLayer({
        id: 'tracks-origin-markers',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'track_origin'],
        layout: {
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 7.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#080d1a',
          'circle-opacity': 1.0,
        },
      });

      // 5. Origin Labels (▶ START label)
      map.addLayer({
        id: 'tracks-origin-labels',
        type: 'symbol',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'track_origin'],
        layout: {
          'text-field': ['concat', '▶ ORIGIN · ', ['get', 'label']],
          'text-size': 10,
          'text-anchor': 'left',
          'text-offset': [1.2, 0],
          'text-allow-overlap': true,
          'text-max-width': 22,
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': '#080d1a',
          'text-halo-width': 2.5,
          'text-opacity': 0.95,
        },
      });

      // 5b. EEZ Ingress Markers (Crossed 200nm Kenya EEZ Line)
      map.addLayer({
        id: 'tracks-ingress-markers',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'track_ingress'],
        layout: {
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 6.5,
          'circle-color': '#38bdf8',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0369a1',
        },
      });

      // 5c. EEZ Ingress Labels
      map.addLayer({
        id: 'tracks-ingress-labels',
        type: 'symbol',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'track_ingress'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 9.5,
          'text-anchor': 'left',
          'text-offset': [1.2, 0],
          'text-allow-overlap': true,
          'text-max-width': 22,
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'text-color': '#38bdf8',
          'text-halo-color': '#080d1a',
          'text-halo-width': 2.5,
          'text-opacity': 0.95,
        },
      });

      // 6. AIS Gap Warning Labels (⚠️ markers where transponder was disabled)
      map.addLayer({
        id: 'tracks-gap-labels',
        type: 'symbol',
        source: 'sentinelcatch-data',
        filter: ['all',
          ['==', ['get', 'type'], 'vessel_track_waypoint'],
          ['==', ['get', 'isGapPoint'], true],
        ],
        layout: {
          'text-field': '⚠️',
          'text-size': 15,
          'text-anchor': 'bottom',
          'text-offset': [0, -0.6],
          'text-allow-overlap': true,
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'text-opacity': 0.95,
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
              <div class="track-endpoints-badge">
                <div class="ep-row">▶ <strong>Origin:</strong> ${props.originName || 'High Seas'}</div>
                <div class="ep-row">🎯 <strong>Target:</strong> ${props.destName || 'Radar Contact Centroid'}</div>
              </div>
              <div class="track-popup-meta">
                <span>📏 Traversed: <strong>${props.totalDistanceNm} nm</strong></span>
                <span>⏱️ Window: <strong>${props.totalDurationHours}h</strong></span>
              </div>
              ${props.aisGapHoursAgo ? `<div class="track-popup-gap">⚠️ Transponder Ceased: <strong>${props.aisGapHoursAgo}h ago</strong></div>` : ''}
              <div class="track-popup-hint">Click route line to inspect full intelligence</div>
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

      // Interactive hover on route origin (▶ START)
      map.on('mouseenter', 'tracks-origin-markers', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        }
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="waypoint-popup-card" style="border-top: 3px solid ${props.color}">
              <div class="wp-origin-tag">▶ ROUTE ORIGIN · FIRST CONTACT</div>
              <div class="wp-title"><strong>${props.vesselName}</strong></div>
              <div class="wp-label">${props.label}</div>
              <div class="wp-meta">⏱️ ${props.hoursAgo}h ago · ⚡ ${props.speedKnots} kn · 🧭 ${props.heading}°</div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'tracks-origin-markers', () => {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) popupRef.current.remove();
      });

      // Interactive hover on intermediate waypoints
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
    setVis('territorial-line', visibleLayers.eez);
    setVis('mpas-fill', visibleLayers.mpas);
    setVis('mpas-line', visibleLayers.mpas);
    setVis('tracks-glow', visibleLayers.tracks);
    setVis('tracks-line', visibleLayers.tracks);
    setVis('tracks-waypoints', visibleLayers.tracks);
    setVis('tracks-origin-markers', visibleLayers.tracks);
    setVis('tracks-origin-labels', visibleLayers.tracks);
    setVis('tracks-ingress-markers', visibleLayers.tracks);
    setVis('tracks-ingress-labels', visibleLayers.tracks);
    setVis('tracks-gap-labels', visibleLayers.tracks);
    setVis('ships-circle', visibleLayers.ships);
    setVis('coverage-fill', visibleLayers.coverage);
    setVis('ports-circle', visibleLayers.ports);
    setVis('ports-label', visibleLayers.ports);
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

      // Create custom DOM element for tactical pin (God's Eye Surface Beacon)
      const el = document.createElement('div');
      el.className = `tactical-map-pin ${isSelected ? 'is-selected' : ''} band-${(c.band || 'high').toLowerCase()}`;
      el.setAttribute('data-case-id', c.id);

      el.innerHTML = `
        <div class="pin-tactical-chip ${isSelected ? 'target-locked' : ''}">
          <span class="chip-flag">${flagEmoji}</span>
          <span class="chip-score ${(c.band || 'high').toLowerCase()}">${score}</span>
          <span class="chip-name">${vesselName.length > 15 ? vesselName.slice(0, 14) + '…' : vesselName}</span>
          ${isSelected ? '<span class="chip-locked-tag">LOCKED</span>' : '<span class="chip-pulse-dot"></span>'}
        </div>
        <div class="pin-surface-target">
          <div class="target-ripple ring-outer"></div>
          <div class="target-ripple ring-inner"></div>
          <div class="target-center-dot ${(c.band || 'high').toLowerCase()}"></div>
        </div>
      `;

      // Click to select case and center smoothly in stable fixed 3D perspective
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectCase(c.id);
        map.flyTo({
          center: [lon, lat],
          zoom: 9.2,
          pitch: 24,
          bearing: 0,
          essential: true,
          duration: 1000,
        });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
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
      zoom: 9.2,
      pitch: 24,
      bearing: 0,
      essential: true,
      duration: 1200,
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
      originName: f.properties.originName,
      destName: f.properties.destName,
      aisGapHoursAgo: f.properties.aisGapHoursAgo,
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
          className="btn-projection"
          onClick={resetToFairway}
          title="Reset to Full Kenya EEZ Maritime Fairway (God's Eye Overview)"
          id="reset-fairway-btn"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
          </svg>
          <span>EEZ Fairway</span>
        </button>

        {/* Quick Layer Visibility Toggles */}
        <div className="layer-pill-group">
          <label className={`layer-pill ${visibleLayers.eez ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.eez}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, eez: e.target.checked }))}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>EEZ</span>
          </label>
          <label className={`layer-pill ${visibleLayers.mpas ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.mpas}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, mpas: e.target.checked }))}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span>MPAs</span>
          </label>
          <label className={`layer-pill ${visibleLayers.tracks ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.tracks}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, tracks: e.target.checked }))}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19L9 14L15 20L20 4"/></svg>
            <span>Vessel Routes</span>
          </label>
          <label className={`layer-pill ${visibleLayers.cases ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.cases}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, cases: e.target.checked }))}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
            <span>Vessel Pins</span>
          </label>
          <label className={`layer-pill ${visibleLayers.ships ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.ships}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, ships: e.target.checked }))}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            <span>Live AIS</span>
          </label>
          <label className={`layer-pill ${visibleLayers.coverage ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={visibleLayers.coverage}
              onChange={(e) => setVisibleLayers((p) => ({ ...p, coverage: e.target.checked }))}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
            <span>AIS Grid</span>
          </label>
        </div>
      </div>

      {/* Floating Tactical Vessel Routes Legend (Distinct Color & Line per Ship) */}
      {visibleLayers.tracks && trackList.length > 0 && showRoutesPanel && (
        <div className={`map-vessel-legend ${legendCollapsed ? 'collapsed' : ''}`}>
          <div className="legend-header" onClick={() => setLegendCollapsed((p) => !p)}>
            <div className="legend-header-left">
              <span className="legend-pulse-dot"></span>
              <span className="legend-title">Vessel Route Tracks ({trackList.length})</span>
            </div>
            <div className="legend-header-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="legend-action-btn"
                onClick={() => setLegendCollapsed((p) => !p)}
                title={legendCollapsed ? 'Expand Panel' : 'Minimize Panel'}
                type="button"
              >
                {legendCollapsed ? '▲' : '▼'}
              </button>
              <button
                className="legend-action-btn legend-cancel-btn"
                onClick={() => setShowRoutesPanel(false)}
                title="Dismiss Route Tracks Panel"
                type="button"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
          {!legendCollapsed && (
            <div className="legend-items-list">
              {trackList.map((tr) => (
                <div
                  key={tr.caseId}
                  className={`legend-item-card ${selectedCaseId === tr.caseId ? 'is-active' : ''}`}
                  onClick={() => {
                    onSelectCase(tr.caseId);
                    flyToTrack(tr);
                  }}
                  title={`Trace ${tr.vesselName} route from start to end (${tr.totalDistanceNm} nm)`}
                >
                  <div className="legend-row-top">
                    <span
                      className="legend-color-dot"
                      style={{
                        backgroundColor: tr.color,
                        boxShadow: `0 0 8px ${tr.color}`,
                      }}
                    />
                    <span className="legend-vessel-name">
                      {tr.flagEmoji} {tr.vesselName}
                    </span>
                    <span className="legend-distance-badge">{tr.totalDistanceNm} nm</span>
                  </div>
                  <div className="legend-endpoints-flow">
                    <span className="ep-tag ep-start" title={tr.originName}>▶ {tr.originName || 'High Seas'}</span>
                    <span className="ep-sep">➔</span>
                    <span className="ep-tag ep-target" title={tr.destName}>🎯 {tr.destName || 'Active Target'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Reopen Button if Panel was closed/cancelled */}
      {visibleLayers.tracks && trackList.length > 0 && !showRoutesPanel && (
        <button
          className="btn-reopen-routes"
          onClick={() => setShowRoutesPanel(true)}
          title="Open Vessel Route Tracks Panel"
          type="button"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19L9 14L15 20L20 4"/>
          </svg>
          <span>Vessel Routes ({trackList.length})</span>
        </button>
      )}
    </div>
  );
}
