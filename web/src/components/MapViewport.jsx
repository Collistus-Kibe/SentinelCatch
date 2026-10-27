import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getTranslation } from '../services/i18n.js';
import { getVesselPhoto, getFlagEmoji } from '../utils/vesselAssets.js';

// Unified Master Style with both Satellite and Dark Ocean raster sources
const MARITIME_MASTER_STYLE = {
  version: 8,
  name: 'SentinelCatch Maritime Intelligence Basemap',
  sources: {
    'esri-satellite-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics, CNES/Airbus DS',
    },
    'esri-satellite-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
    'esri-dark-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, HERE, Garmin, OpenStreetMap contributors',
    },
    'esri-dark-labels': {
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
      paint: { 'background-color': '#050c18' },
    },
    // Satellite Imagery Basemap Layers (Default)
    {
      id: 'satellite-base',
      type: 'raster',
      source: 'esri-satellite-tiles',
      minzoom: 0,
      maxzoom: 19,
      layout: { visibility: 'visible' },
    },
    {
      id: 'satellite-labels',
      type: 'raster',
      source: 'esri-satellite-labels',
      minzoom: 0,
      maxzoom: 19,
      layout: { visibility: 'visible' },
    },
    // Dark Nautical Basemap Layers (Toggled via basemap switcher)
    {
      id: 'dark-base',
      type: 'raster',
      source: 'esri-dark-tiles',
      minzoom: 0,
      maxzoom: 19,
      layout: { visibility: 'none' },
    },
    {
      id: 'dark-labels',
      type: 'raster',
      source: 'esri-dark-labels',
      minzoom: 0,
      maxzoom: 19,
      layout: { visibility: 'none' },
    },
  ],
};

// Generate weighted geospatial heatmap GeoJSON
function generateHeatmapGeoJson(cases = [], mapLayersData = null) {
  const points = [];

  // 1. Cases coordinates (weighted by threat and behavior)
  cases.forEach((c) => {
    const lat = c.features?.lat ?? c.lat;
    const lon = c.features?.lon ?? c.lon;
    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      const isHigh = c.band === 'High' || (c.score_final && c.score_final >= 75);
      const isMed = c.band === 'Medium' || (c.score_final && c.score_final >= 50);
      const weight = isHigh ? 1.0 : isMed ? 0.72 : 0.42;

      points.push({
        type: 'Feature',
        properties: { weight, type: 'case_point' },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      });

      // Transshipment or high-threat anomaly hotspot cluster
      if (isHigh) {
        const offsets = [
          [0.035, 0.025], [-0.035, -0.025], [0.025, -0.035], [-0.025, 0.035],
          [0.05, 0.0], [0.0, 0.05],
        ];
        offsets.forEach(([dLon, dLat]) => {
          points.push({
            type: 'Feature',
            properties: { weight: 0.88, type: 'hotspot_cluster' },
            geometry: { type: 'Point', coordinates: [lon + dLon, lat + dLat] },
          });
        });
      }
    }
  });

  // 2. Track waypoints & live AIS from mapLayersData
  if (mapLayersData?.features) {
    mapLayersData.features.forEach((f) => {
      if (f.properties?.type === 'vessel_track_waypoint' && f.geometry?.coordinates) {
        points.push({
          type: 'Feature',
          properties: {
            weight: f.properties.isGapPoint ? 0.95 : 0.45,
            type: 'track_waypoint',
          },
          geometry: f.geometry,
        });
      } else if (f.properties?.type === 'ais_ship' && f.geometry?.coordinates) {
        points.push({
          type: 'Feature',
          properties: { weight: 0.35, type: 'ais_traffic' },
          geometry: f.geometry,
        });
      }
    });
  }

  // 3. East Africa commercial fairway traffic concentrations (Mombasa, Shimoni, Tanga, Zanzibar)
  const baselineFairwayNodes = [
    [-4.5800, 39.5200, 1.0],  // Primary Shimoni transshipment rendezvous area
    [-4.6200, 39.5800, 0.92],
    [-4.5100, 39.6900, 0.85],
    [-4.1800, 39.9200, 0.75], // Mombasa harbour approach
    [-4.3200, 39.8100, 0.78],
    [-4.7500, 39.6200, 0.80], // South Coast / Vanga corridor
    [-5.0500, 39.5500, 0.65], // Tanga northern channel
    [-5.4500, 39.4200, 0.60], // Zanzibar channel
    [-3.8500, 40.2000, 0.52], // Malindi channel
  ];
  baselineFairwayNodes.forEach(([lat, lon, weight]) => {
    points.push({
      type: 'Feature',
      properties: { weight, type: 'fairway_density' },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  });

  return {
    type: 'FeatureCollection',
    features: points,
  };
}

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
  const popupRef = useRef(null);

  const [basemapMode, setBasemapMode] = useState('satellite'); // 'satellite' | 'nautical'
  const [layersLoaded, setLayersLoaded] = useState(false);
  const [mapLayersData, setMapLayersData] = useState(null);

  // Layer Visibility Toolbar State
  const [visibleLayers, setVisibleLayers] = useState({
    eez: true,
    mpas: true,
    tracks: true,
    cases: true,
    heatmap: true,
    ships: true,
  });

  // Fetch base GeoJSON layers
  useEffect(() => {
    fetch('/api/map/layers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setMapLayersData(data))
      .catch((err) => console.error('Failed to load map layers:', err));
  }, []);

  // Initialize MapLibre in a stable, realistic maritime tactical projection
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MARITIME_MASTER_STYLE,
      center: [39.65, -4.58], // Centered on Mombasa - Shimoni - Tanga - Zanzibar maritime boundary
      zoom: 7.2,
      minZoom: 4.5,
      maxZoom: 16.0,
      maxBounds: [
        [28.0, -12.5],
        [54.0, 7.5],
      ],
      pitch: 0, // Clean flat overhead operational view matching Reference Image A & B
      bearing: 0,
      dragRotate: false,
      touchPitch: false,
      attributionControl: false,
    });

    map.on('error', (e) => {
      console.warn('MapLibre event note:', e.error?.message || e);
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

  // Handle Basemap Toggle (Satellite vs Dark Nautical)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) return;

    const isSat = basemapMode === 'satellite';
    if (map.getLayer('satellite-base')) {
      map.setLayoutProperty('satellite-base', 'visibility', isSat ? 'visible' : 'none');
    }
    if (map.getLayer('satellite-labels')) {
      map.setLayoutProperty('satellite-labels', 'visibility', isSat ? 'visible' : 'none');
    }
    if (map.getLayer('dark-base')) {
      map.setLayoutProperty('dark-base', 'visibility', isSat ? 'none' : 'visible');
    }
    if (map.getLayer('dark-labels')) {
      map.setLayoutProperty('dark-labels', 'visibility', isSat ? 'none' : 'visible');
    }
  }, [basemapMode, layersLoaded]);

  // Recenter to maritime surveillance fairway
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [39.65, -4.58],
      zoom: 7.2,
      bearing: 0,
      essential: true,
      duration: 1200,
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomOut();
  }, []);

  const toggleBasemap = useCallback(() => {
    setBasemapMode((prev) => (prev === 'satellite' ? 'nautical' : 'satellite'));
  }, []);

  // Add / Update Map Layers (EEZ, MPAs, Heatmap, Vessel Routes, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded || !mapLayersData) return;

    // 1. Data Source
    if (!map.getSource('sentinelcatch-data')) {
      map.addSource('sentinelcatch-data', {
        type: 'geojson',
        data: mapLayersData,
      });

      // ── EEZ Boundary Fill & Dashed Line ──
      map.addLayer({
        id: 'eez-fill',
        type: 'fill',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'id'], 'kenya-eez'],
        paint: {
          'fill-color': '#0ea5e9',
          'fill-opacity': 0.04,
        },
      });

      map.addLayer({
        id: 'eez-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'id'], 'kenya-eez'],
        paint: {
          'line-color': '#38bdf8',
          'line-width': 1.6,
          'line-dasharray': [4, 3],
          'line-opacity': 0.75,
        },
      });

      // Sovereign 12 nm Territorial Sea Line
      map.addLayer({
        id: 'territorial-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'territorial_boundary'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 1.4,
          'line-dasharray': [3, 2],
          'line-opacity': 0.65,
        },
      });

      // ── Marine Protected Areas (MPAs) - Outlined Green Dotted Shapes ──
      map.addLayer({
        id: 'mpas-fill',
        type: 'fill',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.08,
        },
      });

      map.addLayer({
        id: 'mpas-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        paint: {
          'line-color': '#34d399',
          'line-width': 1.8,
          'line-dasharray': [3, 2],
          'line-opacity': 0.85,
        },
      });

      // ── Vessel Route Trajectories ──
      // Subtle Glow Layer
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
            8,
            4,
          ],
          'line-opacity': 0.35,
          'line-blur': 3,
        },
      });

      // Crisp Route Line
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
            3.2,
            1.8,
          ],
          'line-opacity': 0.9,
          'line-dasharray': [4, 1.5],
        },
      });

      // Live AIS Ships (Circles)
      map.addLayer({
        id: 'ships-circle',
        type: 'circle',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'ais_ship'],
        layout: {
          visibility: visibleLayers.ships ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#38bdf8',
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#0284c7',
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
            <div class="track-popup-card" style="border-left: 3px solid ${props.color}">
              <div class="track-popup-title">${props.flagEmoji || '🚢'} <strong>${props.vesselName}</strong></div>
              <div class="track-endpoints-badge">
                <div class="ep-row">▶ <strong>Origin:</strong> ${props.originName || 'High Seas'}</div>
                <div class="ep-row">🎯 <strong>Target:</strong> ${props.destName || 'Active Centroid'}</div>
              </div>
              <div class="track-popup-meta">
                <span>Distance: <strong>${props.totalDistanceNm} nm</strong></span>
                <span>Window: <strong>${props.totalDurationHours}h</strong></span>
              </div>
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
    } else {
      map.getSource('sentinelcatch-data').setData(mapLayersData);
    }

    // 2. Heatmap Source & Layer
    const heatmapGeoJson = generateHeatmapGeoJson(cases, mapLayersData);
    if (!map.getSource('sentinelcatch-heatmap')) {
      map.addSource('sentinelcatch-heatmap', {
        type: 'geojson',
        data: heatmapGeoJson,
      });

      // Smooth semi-transparent geospatial heatmap layer
      map.addLayer({
        id: 'vessel-density-heatmap',
        type: 'heatmap',
        source: 'sentinelcatch-heatmap',
        layout: {
          visibility: visibleLayers.heatmap ? 'visible' : 'none',
        },
        paint: {
          // Weight scale based on risk & encounter frequency
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'weight'],
            0, 0,
            1, 1,
          ],
          // Intensity scale with zoom
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 0.7,
            7, 1.4,
            10, 2.0,
          ],
          // Color ramp: Dark Blue/transparent -> Cyan -> Green -> Yellow -> Orange -> Red
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(11, 18, 32, 0)',
            0.18, 'rgba(14, 165, 233, 0.40)', // Cyan
            0.38, 'rgba(16, 185, 129, 0.65)', // Green
            0.62, 'rgba(234, 179, 8, 0.85)',  // Yellow
            0.82, 'rgba(249, 115, 22, 0.92)', // Orange
            1.0, 'rgba(239, 68, 68, 0.98)',   // Red
          ],
          // Radius scale
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 20,
            7, 45,
            10, 75,
          ],
          'heatmap-opacity': 0.82,
        },
      });
    } else {
      map.getSource('sentinelcatch-heatmap').setData(heatmapGeoJson);
    }
  }, [layersLoaded, mapLayersData, cases, selectedCaseId, visibleLayers, onSelectCase]);

  // Update visibility of map layers
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
    setVis('ships-circle', visibleLayers.ships);
    setVis('vessel-density-heatmap', visibleLayers.heatmap);
  }, [visibleLayers, layersLoaded]);

  // Render Custom Directional Vessel Markers & Selected Target Reticle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

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
      const vesselName = candidate?.vesselName || c.features?.locationLabel || `Contact #${c.id}`;
      const heading = candidate?.heading || 210;
      const band = (c.band || 'High').toUpperCase();
      const isHigh = band === 'HIGH' || (c.score_final && c.score_final >= 75);

      // Create custom DOM element for vessel marker
      const el = document.createElement('div');
      el.className = `map-vessel-marker ${isSelected ? 'marker-is-selected' : ''} ${isHigh ? 'threat-high' : 'threat-normal'}`;

      if (isSelected) {
        // Red target box reticle with floating label matching Reference Image C
        el.innerHTML = `
          <div class="selected-target-reticle">
            <div class="reticle-corner reticle-corner-tl"></div>
            <div class="reticle-corner reticle-corner-tr"></div>
            <div class="reticle-corner reticle-corner-bl"></div>
            <div class="reticle-corner reticle-corner-br"></div>
            
            <div class="selected-vessel-chevron" style="transform: rotate(${heading}deg);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="1.5">
                <polygon points="12 2 19 21 12 17 5 21 12 2" />
              </svg>
            </div>
          </div>

          <!-- Floating Black Label Box with Alert Icon -->
          <div class="selected-callout-pill">
            <span class="callout-alert-icon">⚠️</span>
            <span class="callout-vessel-name">${vesselName}</span>
          </div>
        `;
      } else {
        // Directional vessel chevron indicator
        const chevronColor = isHigh ? '#ef4444' : c.band === 'Medium' ? '#f59e0b' : '#38bdf8';
        el.innerHTML = `
          <div class="directional-chevron-wrapper" style="transform: rotate(${heading}deg);" title="${vesselName}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${chevronColor}" stroke="#0b1220" stroke-width="1.5">
              <polygon points="12 2 19 21 12 17 5 21 12 2" />
            </svg>
          </div>
        `;
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectCase(c.id);
        map.flyTo({
          center: [lon, lat],
          zoom: Math.max(8.5, map.getZoom()),
          duration: 900,
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
      zoom: 8.8,
      duration: 1000,
    });
  }, [flyToCoords]);

  return (
    <div className="map-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Center-Top HUD Toolbar Matching Reference Image */}
      <div className="map-hud-toolbar">
        <button
          className={`hud-pill-btn ${visibleLayers.eez ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, eez: !p.eez }))}
          type="button"
          title="Toggle EEZ Boundaries"
        >
          <span className="hud-icon">⛶</span>
          <span>EEZ</span>
        </button>

        <button
          className={`hud-pill-btn ${visibleLayers.mpas ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, mpas: !p.mpas }))}
          type="button"
          title="Toggle Marine Protected Areas"
        >
          <span className="hud-icon">⛶</span>
          <span>MPAs</span>
        </button>

        <button
          className={`hud-pill-btn ${visibleLayers.tracks ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, tracks: !p.tracks }))}
          type="button"
          title="Toggle Vessel Route Trajectories"
        >
          <span className="hud-icon">📈</span>
          <span>Vessel Routes</span>
        </button>

        <button
          className={`hud-pill-btn ${visibleLayers.cases ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, cases: !p.cases }))}
          type="button"
          title="Toggle Vessel Position Markers"
        >
          <span className="hud-icon">📍</span>
          <span>Vessel Pins</span>
        </button>

        <button
          className={`hud-pill-btn hud-heatmap-btn ${visibleLayers.heatmap ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, heatmap: !p.heatmap }))}
          type="button"
          title="Toggle Geospatial Vessel Activity & Anomaly Heatmap"
        >
          <span className="hud-icon">🔥</span>
          <span>Heatmap</span>
        </button>

        <button
          className={`hud-pill-btn ${visibleLayers.ships ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, ships: !p.ships }))}
          type="button"
          title="Toggle Live AIS Fleet"
        >
          <span className="hud-icon">🚢</span>
          <span>Live AIS</span>
        </button>
      </div>

      {/* Scale Bar (Bottom-Left) */}
      <div className="map-hud-scale-bar" title="Nautical & Metric Distance Scale">
        <div className="scale-ticks-row">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>100 km</span>
          <span className="north-arrow">▲ N</span>
        </div>
        <div className="scale-bar-line"></div>
      </div>

      {/* Map Control Buttons (Bottom-Right) */}
      <div className="map-hud-controls-group">
        <button
          className="map-control-btn"
          onClick={handleZoomIn}
          title="Zoom In"
          type="button"
        >
          +
        </button>

        <button
          className="map-control-btn map-basemap-btn"
          onClick={toggleBasemap}
          title={basemapMode === 'satellite' ? 'Switch to Dark Nautical Map' : 'Switch to Satellite Imagery'}
          type="button"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>

        <button
          className="map-control-btn"
          onClick={handleRecenter}
          title="Recenter to Maritime Fairway"
          type="button"
        >
          ⌖
        </button>

        <button
          className="map-control-btn"
          onClick={handleZoomOut}
          title="Zoom Out"
          type="button"
        >
          −
        </button>
      </div>
    </div>
  );
}
