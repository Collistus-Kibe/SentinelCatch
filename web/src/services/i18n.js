/**
 * SentinelCatch Localization (English & Kiswahili)
 */

export const translations = {
  en: {
    appTitle: 'SentinelCatch',
    appSubtitle: 'AI-Powered Live Watch for Kenya’s Waters',
    tagline: 'Autonomous Dark Vessel Detection in Kenya’s EEZ',
    
    // Navigation
    navLiveMap: 'Operations Map',
    navFeed: 'Case Feed',
    navAlerts: 'Live Alerts',

    // Projections
    projectionFlat: 'Flat Map',
    projectionGlobe: '3D Globe',
    projectionTooltip: 'Toggle Flat (Mercator) vs 3D Globe Projection',

    // Sectors
    sectorAll: 'All Sectors',
    sectorLamu: 'Lamu',
    sectorMalindiKilifi: 'Malindi-Kilifi',
    sectorMombasa: 'Mombasa',
    sectorSouthCoast: 'South Coast / Vanga',

    // Severity Bands
    bandAll: 'All Severity',
    bandHigh: 'High Severity',
    bandMedium: 'Medium',
    bandLow: 'Low',

    // Statuses
    statusNew: 'New',
    statusAcknowledged: 'Acknowledged',
    statusDispatched: 'Patrol Dispatched',
    statusFalseAlarm: 'False Alarm',
    statusResolved: 'Resolved',

    // Intel Panel
    intelTitle: 'Tactical Case Intel',
    intelScore: 'Confidence Score',
    intelWhyFlagged: 'Why It Was Flagged',
    intelFeatures: '10 Operational Features',
    intelAction: 'Officer Actions',
    intelAudit: 'Action Audit Trail',
    intelRawEvidence: 'Inspect Raw Telemetry',

    // Actions
    btnAcknowledge: 'Acknowledge Case',
    btnDispatch: 'Dispatch Patrol',
    btnFalseAlarm: 'Mark False Alarm',
    btnResolve: 'Mark Resolved',
    btnShareWhatsApp: 'Share on WhatsApp',
    btnCopyBrief: 'Copy Tactical Brief',
    copiedSuccess: 'Brief copied to clipboard!',

    // Features labels
    f_inMPA: 'Marine Protected Area',
    f_eezBoundary: 'EEZ Boundary Proximity',
    f_loitering: 'Recurrent Loitering',
    f_displacement: 'Displacement Pattern',
    f_aisGap: 'Corroborated AIS Gap',
    f_fleet: 'Nearby AIS Fleet',
    f_port: 'Port & Shore Distance',
    f_length: 'Estimated Vessel Length',
    f_seaState: 'Sea State & Radar Penalty',
    f_aisCoverage: 'AIS Coverage Confidence',

    // Layers
    layersTitle: 'Map Layers',
    layerEEZ: 'Kenya EEZ Boundary',
    layerMPAs: 'Marine Protected Areas (MPAs)',
    layerDetections: 'Dark Vessel Cases',
    layerAIS: 'Live AIS Ships',
    layerCoverage: 'AIS Coverage Grid',
    layerPorts: 'Ports & Harbours',

    // Audio & Status
    soundOn: 'Alert Sound: On',
    soundOff: 'Alert Sound: Off',
    sseConnected: 'Live SSE: Connected',
    sseConnecting: 'Live SSE: Connecting',
    sendTestAlert: 'Trigger Test Alert',
    noCasesFound: 'No cases match the selected filters.',
  },

  sw: {
    appTitle: 'SentinelCatch',
    appSubtitle: 'Ulinzi wa Moja kwa Moja wa Maji ya Kenya Kutumia Akili Unde (AI)',
    tagline: 'Kugundua Meli Zilizojificha Katika Eneo Maalum la Kiuchumi la Kenya (EEZ)',

    // Navigation
    navLiveMap: 'Ramani ya Operesheni',
    navFeed: 'Orodha ya Matukio',
    navAlerts: 'Taarifa za Dharura',

    // Projections
    projectionFlat: 'Ramani Tambarare',
    projectionGlobe: 'Tufe la Dunia (3D)',
    projectionTooltip: 'Badilisha Ramani Tambarare au Tufe la 3D',

    // Sectors
    sectorAll: 'Ukanda Wote',
    sectorLamu: 'Lamu',
    sectorMalindiKilifi: 'Malindi-Kilifi',
    sectorMombasa: 'Mombasa',
    sectorSouthCoast: 'Pwani ya Kusini / Vanga',

    // Severity Bands
    bandAll: 'Viwango Vyote',
    bandHigh: 'Hatari Kubwa',
    bandMedium: 'Hatari ya Kati',
    bandLow: 'Hatari Ndogo',

    // Statuses
    statusNew: 'Mpya',
    statusAcknowledged: 'Imethibitishwa',
    statusDispatched: 'Doria Imetumwa',
    statusFalseAlarm: 'Taarifa ya Uongo',
    statusResolved: 'Imetatuliwa',

    // Intel Panel
    intelTitle: 'Taarifa Maalum ya Kijasusi',
    intelScore: 'Kiwango cha Uhakika',
    intelWhyFlagged: 'Sababu ya Kutiliwa Shaka',
    intelFeatures: 'Vipengele 10 vya Kioperesheni',
    intelAction: 'Hatua za Afisa',
    intelAudit: 'Kumbukumbu za Hatua Zilizochukuliwa',
    intelRawEvidence: 'Kagua Takwimu Ghafi za Satelaiti',

    // Actions
    btnAcknowledge: 'Thibitisha Tukio',
    btnDispatch: 'Tuma Doria ya Majini',
    btnFalseAlarm: 'Weka Alama: Taarifa ya Uongo',
    btnResolve: 'Weka Alama: Limetatuliwa',
    btnShareWhatsApp: 'Tuma kwenye WhatsApp',
    btnCopyBrief: 'Nakili Muhtasari wa Kijeshi',
    copiedSuccess: 'Muhtasari umenakiliwa!',

    // Features labels
    f_inMPA: 'Eneo Lililolindwa la Bahari (MPA)',
    f_eezBoundary: 'Ukaribu na Mpakani mwa EEZ',
    f_loitering: 'Kuzunguka Mara kwa Mara (Loitering)',
    f_displacement: 'Mwelekeo wa Mwendo',
    f_aisGap: 'Kuzimika kwa Mawimbi ya AIS',
    f_fleet: 'Meli Nyingine za AIS Karibu',
    f_port: 'Umbali kutoka Bandarini / Pwani',
    f_length: 'Makadirio ya Urefu wa Chombo',
    f_seaState: 'Hali ya Mawimbi ya Bahari',
    f_aisCoverage: 'Uhakika wa Mawasiliano ya AIS',

    // Layers
    layersTitle: 'Tabaka za Ramani',
    layerEEZ: 'Mpaka wa EEZ ya Kenya',
    layerMPAs: 'Hifadhi za Bahari (MPAs)',
    layerDetections: 'Vyombo Vilivyotiliwa Shaka',
    layerAIS: 'Meli Zinazoonekana (AIS)',
    layerCoverage: 'Mtandao wa Mawasiliano ya AIS',
    layerPorts: 'Bandari na Vituo vya Pwani',

    // Audio & Status
    soundOn: 'Sauti ya Tahadhari: Imewashwa',
    soundOff: 'Sauti ya Tahadhari: Imezimwa',
    sseConnected: 'Muunganisho wa Moja kwa Moja: Upo',
    sseConnecting: 'Inaunganisha Moja kwa Moja...',
    sendTestAlert: 'Jaribu Tahadhari ya Mfumo',
    noCasesFound: 'Hakuna vyombo vilivyopatikana kwa vichujio hivi.',
  },
};

export function getTranslation(lang = 'en') {
  return translations[lang] || translations.en;
}

export default translations;
