import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getTranslation } from '../services/i18n.js';

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
      pitch: 20,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');

    map.on('error', (e) => {
      // Log minor tile warning without stopping rendering
      console.warn('MapLibre tile event:', e.error?.message || e);
    });

    map.on('load', () => {
      mapRef.current = map;
      setLayersLoaded(true);
      map.resize();
    });

    // Ensure proper canvas size after layout mount
    const resizeTimer = setTimeout(() => {
      map.resize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
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

  // Add / Update Layers on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded || !mapLayersData) return;

    // 1. Add GeoJSON Source if not exists
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

      // Dark Vessel Cases
      map.addLayer({
        id: 'cases-pulse',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'case'],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 12,
            10, 24
          ],
          'circle-color': [
            'match',
            ['get', 'band'],
            'High', '#ef4444',
            'Medium', '#f59e0b',
            '#22c55e',
          ],
          'circle-opacity': 0.35,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': [
            'match',
            ['get', 'band'],
            'High', '#ef4444',
            'Medium', '#f59e0b',
            '#22c55e',
          ],
        },
      });

      map.addLayer({
        id: 'cases-center',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'case'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': [
            'match',
            ['get', 'band'],
            'High', '#ef4444',
            'Medium', '#f59e0b',
            '#22c55e',
          ],
        },
      });

      // Click to select case
      map.on('click', 'cases-pulse', (e) => {
        const feature = e.features?.[0];
        if (feature) {
          const caseId = feature.properties?.caseId;
          if (caseId && onSelectCase) {
            onSelectCase(Number(caseId));
          }
        }
      });

      map.on('mouseenter', 'cases-pulse', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'cases-pulse', () => {
        map.getCanvas().style.cursor = '';
      });
    } else {
      map.getSource('sentinelcatch-data').setData(mapLayersData);
    }
  }, [layersLoaded, mapLayersData, onSelectCase, visibleLayers.coverage]);

  // Update visibility toggles
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
    setVis('cases-pulse', visibleLayers.cases);
    setVis('cases-center', visibleLayers.cases);
    setVis('ships-circle', visibleLayers.ships);
    setVis('coverage-fill', visibleLayers.coverage);
    setVis('ports-circle', visibleLayers.ports);
  }, [visibleLayers, layersLoaded]);

  // Fly to coordinates when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCoords) return;

    map.flyTo({
      center: [flyToCoords.lon, flyToCoords.lat],
      zoom: 9.5,
      essential: true,
      duration: 1500,
    });
  }, [flyToCoords]);

  return (
    <div className="map-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Projection & Layer Controls Toolbar */}
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
            🚨 Detections
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
