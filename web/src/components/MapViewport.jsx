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
  const [visibleLayers, setVisibleLayers] = useState({
    eez: true,
    mpas: true,
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
      pitch: 22,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
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
    } else {
      map.getSource('sentinelcatch-data').setData(mapLayersData);
    }
  }, [layersLoaded, mapLayersData, visibleLayers.coverage]);

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
    setVis('ships-circle', visibleLayers.ships);
    setVis('coverage-fill', visibleLayers.coverage);
    setVis('ports-circle', visibleLayers.ports);
  }, [visibleLayers, layersLoaded]);

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
      el.className = `tactical-map-pin ${isSelected ? 'is-selected' : ''} band-${(c.band || 'high').toLowerCase()}`;
      el.setAttribute('data-case-id', c.id);

      el.innerHTML = `
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
    </div>
  );
}
