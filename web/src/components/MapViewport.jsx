import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getTranslation } from '../services/i18n.js';
import { getVesselPhoto, getFlagEmoji, FALLBACK_REAL_PHOTO, getVesselOrigin } from '../utils/vesselAssets.js';
import { FlagIcon, getFlagHtml } from './FlagIcon.jsx';

// Unified Master Style with both Satellite and Dark Ocean raster sources
const MARITIME_MASTER_STYLE = {
  version: 8,
  name: 'SentinelCatch Maritime Intelligence Basemap',
  sources: {
    'esri-satellite-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics, CNES/Airbus DS',
      maxzoom: 18,
    },
    'esri-satellite-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 18,
    },
    'esri-dark-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, HERE, Garmin, OpenStreetMap contributors',
      maxzoom: 18,
    },
    'esri-dark-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 18,
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

  const baselineFairwayNodes = [
    [-4.5800, 39.5200, 1.0],  // Shimoni transshipment rendezvous area
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
  onSelectPin,
  onOpenCaseDetails,
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
  const [cursorCoords, setCursorCoords] = useState({ lat: -3.3500, lon: 40.2000 });

  // Responsive ResizeObserver to guarantee MapLibre canvas resizes on mobile & orientation change
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    ro.observe(mapContainerRef.current);

    const handleWindowResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleWindowResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleWindowResize);
    };
  }, []);

  // Layer Visibility Toolbar State (Heatmap is FALSE by default to keep coast clean)
  const [visibleLayers, setVisibleLayers] = useState({
    eez: true,
    mpas: true,
    tracks: true,
    cases: true,
    heatmap: false,
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

  // Initialize MapLibre in a locked, movable surveillance angle
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Responsive, freely navigable maritime perspective across Kenya EEZ and international waters
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MARITIME_MASTER_STYLE,
      center: [40.50, -3.20], // Centered over Kenya EEZ and surveillance approaches
      zoom: 7.2,
      minZoom: 2.2, // Fully unlock zoom out to see Asia, Europe, Africa & Middle East
      maxZoom: 18.0,
      maxBounds: null, // Allow natural pan across the Indian Ocean to trace origins
      dragPan: true,
      scrollZoom: true, // Smooth mouse wheel & trackpad zoom enabled
      boxZoom: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      dragRotate: false,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    // CRITICAL: Set mapRef immediately so ResizeObserver and orientation listeners can trigger map.resize()
    mapRef.current = map;

    map.on('error', (e) => {
      console.warn('MapLibre event note:', e.error?.message || e);
    });

    map.on('mousemove', (e) => {
      if (e.lngLat) {
        setCursorCoords({
          lat: e.lngLat.lat,
          lon: e.lngLat.lng,
        });
      }
    });

    // Listen to BOTH style.load and load so layers and tiles render immediately on mobile
    const onReady = () => {
      setLayersLoaded(true);
      map.resize();
    };

    if (map.isStyleLoaded()) {
      onReady();
    } else {
      map.once('style.load', onReady);
      map.once('load', onReady);
    }

    // WebGL Context Lost / Restored handling for mobile devices
    const canvas = map.getCanvas();
    const handleContextLost = (e) => {
      e.preventDefault();
      console.warn('MapLibre WebGL context lost on mobile');
    };
    const handleContextRestored = () => {
      console.log('MapLibre WebGL context restored');
      map.resize();
    };
    canvas?.addEventListener('webglcontextlost', handleContextLost);
    canvas?.addEventListener('webglcontextrestored', handleContextRestored);

    // Staggered resize timeouts to handle mobile orientation change and layout settling
    const timers = [
      setTimeout(() => map.resize(), 50),
      setTimeout(() => map.resize(), 150),
      setTimeout(() => map.resize(), 350),
      setTimeout(() => map.resize(), 800),
      setTimeout(() => map.resize(), 1600),
    ];

    return () => {
      timers.forEach(clearTimeout);
      canvas?.removeEventListener('webglcontextlost', handleContextLost);
      canvas?.removeEventListener('webglcontextrestored', handleContextRestored);
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

  // Recenter to standard Kenya Coast surveillance corridor
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [40.20, -3.35],
      zoom: 7.7,
      bearing: 0,
      pitch: 0,
      essential: true,
      duration: 1000,
    });
  }, []);

  const toggleBasemap = useCallback(() => {
    setBasemapMode((prev) => (prev === 'satellite' ? 'nautical' : 'satellite'));
  }, []);

  // Add / Update Map Layers (EEZ, MPAs with labels, Heatmap, Routes)
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

      // Sovereign 12 nm Territorial Sea Line (Yellow dashed line along the entire coast)
      map.addLayer({
        id: 'territorial-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'territorial_boundary'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2.0,
          'line-dasharray': [4, 2],
          'line-opacity': 0.85,
        },
      });

      // ── Marine Protected Areas (MPAs) - Neon Emerald Dashed Boundaries ──
      map.addLayer({
        id: 'mpas-fill',
        type: 'fill',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.12,
        },
      });

      map.addLayer({
        id: 'mpas-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        paint: {
          'line-color': '#10b981',
          'line-width': 2.2,
          'line-dasharray': [4, 2],
          'line-opacity': 0.95,
        },
      });

      // MPA Name Labels directly on the map for maritime authorities
      map.addLayer({
        id: 'mpas-labels',
        type: 'symbol',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'MPA'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-offset': [0, 0],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#34d399',
          'text-halo-color': '#050c18',
          'text-halo-width': 2.2,
          'text-opacity': 0.95,
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
            9,
            4,
          ],
          'line-opacity': 0.45,
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
            3.6,
            2.2,
          ],
          'line-opacity': 0.95,
          'line-dasharray': [4, 1.5],
        },
      });

      // ── Trans-Oceanic Global Origin Route Layers (Tracing Vessels back to Home Nations) ──
      map.addLayer({
        id: 'transoceanic-tracks-glow',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'vessel_transoceanic_track'],
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
            7,
            3,
          ],
          'line-opacity': 0.35,
          'line-blur': 2.5,
        },
      });

      map.addLayer({
        id: 'transoceanic-tracks-line',
        type: 'line',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'vessel_transoceanic_track'],
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
          'line-opacity': 0.85,
          'line-dasharray': [6, 2.5],
        },
      });

      // Origin Ports Landmark Symbol Layer (Country Flags & Ports)
      map.addLayer({
        id: 'origin-ports-symbol',
        type: 'symbol',
        source: 'sentinelcatch-data',
        filter: ['==', ['get', 'type'], 'origin_port_marker'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-anchor': 'left',
          'text-offset': [0.8, 0],
          'text-allow-overlap': true,
          visibility: visibleLayers.tracks ? 'visible' : 'none',
        },
        paint: {
          'text-color': '#38bdf8',
          'text-halo-color': '#050c18',
          'text-halo-width': 2.2,
          'text-opacity': 0.95,
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

      // Interactive hover on track lines
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

      // Interactive hover on trans-oceanic origin route lines
      map.on('mouseenter', 'transoceanic-tracks-line', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        }
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="track-popup-card transoceanic-popup" style="border-left: 3px solid ${props.color}">
              <div class="track-popup-title">${props.flagEmoji || '🚢'} <strong>${props.vesselName}</strong> — Trans-Oceanic Voyage</div>
              <div class="track-endpoints-badge">
                <div class="ep-row">▶ <strong>Origin Port:</strong> ${props.originPort || props.originCountry}</div>
                <div class="ep-row">⏱️ <strong>Transit Time:</strong> ~${props.voyageDays || 21} days at sea</div>
              </div>
              <div class="transoceanic-summary-sub">${props.voyageSummary || 'Transited across international waterways into East Africa.'}</div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'transoceanic-tracks-line', () => {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) popupRef.current.remove();
      });

      map.on('click', 'transoceanic-tracks-line', (e) => {
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

      map.addLayer({
        id: 'vessel-density-heatmap',
        type: 'heatmap',
        source: 'sentinelcatch-heatmap',
        layout: {
          visibility: visibleLayers.heatmap ? 'visible' : 'none',
        },
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'weight'],
            0, 0,
            1, 1,
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 0.7,
            7, 1.2,
            10, 1.8,
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(11, 18, 32, 0)',
            0.2, 'rgba(14, 165, 233, 0.40)',
            0.4, 'rgba(16, 185, 129, 0.65)',
            0.65, 'rgba(234, 179, 8, 0.85)',
            0.85, 'rgba(249, 115, 22, 0.92)',
            1.0, 'rgba(239, 68, 68, 0.98)',
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 20,
            7, 40,
            10, 70,
          ],
          'heatmap-opacity': 0.75,
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
    setVis('mpas-labels', visibleLayers.mpas);
    setVis('tracks-glow', visibleLayers.tracks);
    setVis('tracks-line', visibleLayers.tracks);

    // Show trans-oceanic origin routes only in traceback mode or when a vessel is actively inspected
    const showTransoceanic = visibleLayers.tracks && (activeView === 'traceback' || Boolean(selectedCaseId));
    setVis('transoceanic-tracks-glow', showTransoceanic);
    setVis('transoceanic-tracks-line', showTransoceanic);
    setVis('origin-ports-symbol', showTransoceanic);
    setVis('ships-circle', visibleLayers.ships);
    setVis('vessel-density-heatmap', visibleLayers.heatmap);
  }, [visibleLayers, layersLoaded, activeView, selectedCaseId]);

  // Selected case provenance intelligence
  const selectedCaseObj = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );
  const selectedCandidate = selectedCaseObj?.candidate_matches?.[0] || selectedCaseObj?.features?.candidate_matches?.[0] || {};
  const selectedVesselName = selectedCandidate.vesselName || selectedCaseObj?.features?.locationLabel || '';
  const selectedVoyage = useMemo(
    () => (selectedVesselName ? getVesselOrigin(selectedVesselName, selectedCandidate.mmsi) : null),
    [selectedVesselName, selectedCandidate.mmsi]
  );

  // Smoothly fit map camera to full trans-oceanic journey from origin nation
  const handleFitVoyage = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedVoyage && Array.isArray(selectedVoyage.transOceanicRoute) && selectedVoyage.transOceanicRoute.length > 1) {
      const coords = selectedVoyage.transOceanicRoute.map((wp) => [wp.lon, wp.lat]);
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      coords.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      });

      map.fitBounds(
        [[minLon - 4, minLat - 4], [maxLon + 4, maxLat + 4]],
        { padding: { top: 90, bottom: 70, left: 70, right: 70 }, duration: 2000 }
      );
    } else {
      map.flyTo({
        center: [68.0, 5.0],
        zoom: 3.6,
        duration: 1800,
      });
    }
  }, [selectedVoyage]);

  // Handle activeView camera perspective switch (Tactical Coastline vs Forensic Origin Trace-Back)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) return;

    if (activeView === 'traceback') {
      if (selectedVoyage && Array.isArray(selectedVoyage.transOceanicRoute) && selectedVoyage.transOceanicRoute.length > 1) {
        handleFitVoyage();
      } else {
        // Broad Indian Ocean / Asia / Africa theater
        map.flyTo({
          center: [68.0, 5.0],
          zoom: 3.6,
          duration: 2000,
          essential: true,
        });
      }
    } else {
      // Re-center on Kenya Coast surveillance zone
      map.flyTo({
        center: [40.50, -3.20],
        zoom: 7.2,
        duration: 1600,
        essential: true,
      });
    }
  }, [activeView, layersLoaded, selectedVoyage, handleFitVoyage]);

  // Render Custom Directional Chevrons & Interactive Pins on Ship Click
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
      if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) return;

      const isSelected = selectedCaseId === c.id;
      const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || null;
      const vesselName = candidate?.vesselName || c.features?.locationLabel || `Contact #${c.id}`;
      const flagEmoji = getFlagEmoji(candidate?.flag || '');
      const vesselPhoto = getVesselPhoto(vesselName, candidate?.gearType || '');
      const heading = candidate?.heading || 210;
      const speedKnots = candidate?.speedKnots || 12.5;
      const band = (c.band || 'High').toUpperCase();
      const score = c.score_final ?? 86;
      const isHigh = band === 'HIGH' || score >= 75;
      const isIUU = Boolean(candidate?.iuuListed);
      const inMPA = Boolean(c.features?.inMPA || (c.features?.locationLabel && c.features.locationLabel.toLowerCase().includes('reserve')));
      const locLabel = c.features?.locationLabel || (c.sector ? `${c.sector}, Kenya` : 'Kenya Waters');

      const latDms = `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}`;
      const lonDms = `${Math.abs(lon).toFixed(4)}°${lon < 0 ? 'W' : 'E'}`;
      const decimalCoords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      // Create custom DOM element for vessel marker
      const el = document.createElement('div');

      if (isSelected) {
        // ── Full Tactical Pin with Coordinates & 1-Click Copy for Authorities ──
        el.className = `tactical-map-pin is-selected band-${(c.band || 'high').toLowerCase()}`;
        el.setAttribute('data-case-id', c.id);

        el.innerHTML = `
          <!-- Full Recon Photo Card Bubble -->
          <div class="pin-card-bubble">
            <div class="pin-photo-header">
              <img
                src="${vesselPhoto}"
                alt="${vesselName}"
                class="pin-vessel-img"
                loading="lazy"
                onerror="this.onerror=null;this.src='${FALLBACK_REAL_PHOTO}';"
              />
              <div class="pin-real-photo-badge">${isIUU ? 'RFMO IUU RECON' : 'OPEN REGISTRY ARCHIVE'}</div>
              <div class="pin-band-chip ${(c.band || 'high').toLowerCase()}">
                <span class="chip-pulse-dot"></span>
                ${band} · ${score}
              </div>
              ${isIUU ? '<span class="pin-iuu-badge">RFMO BLACKLIST</span>' : ''}
              ${inMPA ? '<span class="pin-mpa-badge">PROTECTED MPA</span>' : ''}
              <button class="pin-close-btn" type="button" title="Close Pin">✕</button>
            </div>

            <div class="pin-details-body">
              <div class="pin-title-row">
                <span class="pin-flag-icon">${getFlagHtml(candidate?.flag || '', flagEmoji, 22)}</span>
                <span class="pin-vessel-title" title="${vesselName}">${vesselName}</span>
              </div>

              <!-- Prominent GPS Coordinates Box for Authorities to Follow Up -->
              <div class="pin-coords-authority-box">
                <div class="pin-coords-header">
                  <span class="coords-label">📍 GPS COORDINATES (WGS84)</span>
                  <button class="btn-copy-pin-gps" data-coords="${decimalCoords}" type="button" title="Copy GPS decimal coordinates for naval/maritime dispatch">
                    📋 Copy GPS
                  </button>
                </div>
                <div class="pin-coords-values">
                  <span class="coords-dms">${latDms}, ${lonDms}</span>
                  <span class="coords-dec">(${decimalCoords})</span>
                </div>
              </div>

              <div class="pin-telemetry-row">
                <span>⚡ <strong>${speedKnots} kn</strong></span>
                <span>🧭 <strong>${heading}°</strong></span>
                <span class="pin-sector-tag">🎯 <strong>${locLabel}</strong></span>
              </div>

              <!-- Button to open right-side intel panel and dismiss pin -->
              <button class="btn-pin-open-details" type="button" title="Open full forensic intelligence dossier">
                <span>📋 Inspect Full Vessel Intel & Dossier ➔</span>
              </button>

              <div class="pin-status-banner">
                <span class="status-pulse-dot"></span>
                <span class="status-text">${inMPA ? '⚠️ INSIDE MARINE PROTECTED AREA' : isIUU ? '⚠️ SUSPECTED IUU TRANSSHIPMENT' : '⚠️ HIGH THREAT CONTACT'}</span>
              </div>
            </div>
          </div>

          <div class="pin-pointer-stem">
            <div class="stem-line"></div>
            <div class="stem-arrow"></div>
          </div>

          <div class="pin-water-target">
            <div class="water-crosshair"></div>
            <div class="water-ripple ring-1"></div>
            <div class="water-ripple ring-2"></div>
          </div>
        `;

        // Wire up copy coordinates button
        const copyBtn = el.querySelector('.btn-copy-pin-gps');
        if (copyBtn) {
          copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(decimalCoords);
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => {
              if (copyBtn) copyBtn.textContent = '📋 Copy GPS';
            }, 2000);
          });
        }

        // Wire up inspect button: closes pin popup and opens right-side details panel
        const detailsBtn = el.querySelector('.btn-pin-open-details');
        if (detailsBtn) {
          detailsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onOpenCaseDetails) {
              onOpenCaseDetails(c.id);
            } else if (onSelectCase) {
              onSelectCase(c.id);
            }
          });
        }

        // Wire up close button
        const closeBtn = el.querySelector('.pin-close-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onSelectPin) onSelectPin(null);
            else if (onSelectCase) onSelectCase(null);
          });
        }
      } else {
        // ── Non-selected Vessel: Tactical Chevron Beacon on the Water ──
        el.className = `tactical-map-chevron band-${(c.band || 'high').toLowerCase()}`;
        const chevronColor = isHigh ? '#ef4444' : c.band === 'Medium' ? '#f59e0b' : '#38bdf8';

        el.innerHTML = `
          <div class="chevron-bubble-pill" title="${vesselName} · ${latDms}, ${lonDms} (Click to inspect pin & coordinates)">
            <span class="chevron-flag">${getFlagHtml(candidate?.flag || '', flagEmoji, 16)}</span>
            <span class="chevron-score">${score}</span>
            <div class="chevron-svg-box" style="transform: rotate(${heading}deg);">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="${chevronColor}" stroke="#ffffff" stroke-width="1.5">
                <polygon points="12 2 19 21 12 17 5 21 12 2" />
              </svg>
            </div>
          </div>
          <div class="chevron-water-dot" style="background: ${chevronColor}; box-shadow: 0 0 8px ${chevronColor};"></div>
        `;
      }

      // Clicking any ship chevron ONLY opens its pin card on the map
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onSelectPin) {
          onSelectPin(c.id);
        } else if (onSelectCase) {
          onSelectCase(c.id);
        }
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: isSelected ? 'bottom' : 'center',
      })
        .setLngLat([lon, lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [cases, activeSector, selectedCaseId, visibleLayers.cases, layersLoaded, onSelectCase, onSelectPin, onOpenCaseDetails]);

  // Recenter gently when flyToCoords changes without altering the zoom angle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCoords) return;

    map.flyTo({
      center: [flyToCoords.lon, flyToCoords.lat],
      zoom: 7.7,
      pitch: 0,
      bearing: 0,
      duration: 800,
    });
  }, [flyToCoords]);

  return (
    <div className="map-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Center-Top HUD Toolbar */}
      <div className="map-hud-toolbar">
        <button
          className={`hud-pill-btn ${visibleLayers.eez ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, eez: !p.eez }))}
          type="button"
          title="Toggle Sovereign EEZ Boundaries & 12nm Territorial Sea"
        >
          <span className="hud-icon">⛶</span>
          <span>EEZ</span>
        </button>

        <button
          className={`hud-pill-btn ${visibleLayers.mpas ? 'active' : ''}`}
          onClick={() => setVisibleLayers((p) => ({ ...p, mpas: !p.mpas }))}
          type="button"
          title="Toggle Marine Protected Areas (MPAs)"
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
          title="Toggle Vessel Position Markers & Pins"
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

      {/* Floating Trans-Oceanic Voyage Provenance Banner when Vessel is Selected */}
      {selectedVoyage && (
        <div className="voyage-provenance-hud-bar">
          <div className="provenance-origin-chip">
            <span className="provenance-flag">
              <FlagIcon country={selectedVoyage.originCountry} emoji={selectedVoyage.flagEmoji} size="md" />
            </span>
            <span className="provenance-origin-title">
              {selectedVoyage.country} · {selectedVoyage.port?.split(',')[0]}
            </span>
          </div>
          <span className="provenance-arrow">➔</span>
          <div className="provenance-transit-route" title={selectedVoyage.voyageSummary}>
            {selectedVoyage.chokepoints?.slice(0, 2).join(' ➔ ')}
          </div>
          <span className="provenance-arrow">➔</span>
          <div className="provenance-dest-chip">
            <span>🎯 Kenya Intercept</span>
            <span className="provenance-days-pill">{selectedVoyage.voyageDays}d at sea</span>
          </div>
          <button
            className="btn-fit-voyage-action"
            type="button"
            onClick={handleFitVoyage}
            title="Auto-zoom to reveal full trans-oceanic route from origin country to Kenya"
          >
            🧭 Trace Origin
          </button>
        </div>
      )}

      {/* Live Coordinates Readout for Maritime Authorities (Bottom Left/Center) */}
      <div className="map-hud-coordinates-bar" title="Live WGS-84 Coordinates on Fairway">
        <span className="coord-hud-badge">CRS: WGS84</span>
        <span className="coord-hud-val">
          📍 {Math.abs(cursorCoords.lat).toFixed(4)}°{cursorCoords.lat < 0 ? 'S' : 'N'}, {Math.abs(cursorCoords.lon).toFixed(4)}°{cursorCoords.lon >= 0 ? 'E' : 'W'}
        </span>
        <span className="coord-hud-lock-tag">
          {activeView === 'traceback' ? '🌐 GLOBAL TRANS-OCEANIC PROVENANCE' : '🛡️ KENYA EEZ TACTICAL SURVEILLANCE'}
        </span>
      </div>

      {/* Map Control Buttons (Bottom-Right) */}
      <div className="map-hud-controls-group">
        <button
          className="map-control-btn"
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom In (+)"
          type="button"
        >
          +
        </button>
        <button
          className="map-control-btn"
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom Out (-)"
          type="button"
        >
          −
        </button>

        {selectedVoyage && (
          <button
            className="map-control-btn btn-trace-hud-icon"
            onClick={handleFitVoyage}
            title={`Trace full voyage back to ${selectedVoyage.country} (${selectedVoyage.port})`}
            type="button"
          >
            🧭
          </button>
        )}

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
          title="Reset / Recenter to Sovereign Kenya Coastline Angle"
          type="button"
        >
          ⌖
        </button>
      </div>
    </div>
  );
}
