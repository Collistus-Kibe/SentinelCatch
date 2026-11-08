import React, { useState } from 'react';

export const COUNTRY_FLAG_CODES = {
  'China': 'cn',
  'Taiwan': 'tw',
  'Sierra Leone': 'sl',
  'Kenya': 'ke',
  'Madagascar': 'mg',
  'Seychelles': 'sc',
  'South Africa': 'za',
  'Mozambique': 'mz',
  'Tanzania': 'tz',
  'Indonesia': 'id',
  'Panama': 'pa',
  'Liberia': 'lr',
  'Togo': 'tg',
  'Iran': 'ir',
  'Oman': 'om',
  'Yemen': 'ye',
  'Somalia': 'so',
  'United Arab Emirates': 'ae',
  'UAE': 'ae',
  'Cook Islands': 'ck',
  'Mauritius': 'mu',
  'Sri Lanka': 'lk',
};

/**
 * Resolve country name or string to 2-letter ISO country code
 */
export function getCountryCode(country = '') {
  if (!country) return null;
  const str = String(country).trim();
  if (COUNTRY_FLAG_CODES[str]) return COUNTRY_FLAG_CODES[str];

  const lower = str.toLowerCase();
  for (const [k, code] of Object.entries(COUNTRY_FLAG_CODES)) {
    if (k.toLowerCase() === lower || lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) {
      return code;
    }
  }
  return null;
}

/**
 * Return raw HTML string for map markers / popups where React components cannot be mounted directly
 */
export function getFlagHtml(countryOrFlag = '', fallbackEmoji = '🚩', size = 18) {
  const code = getCountryCode(countryOrFlag);
  const height = Math.round(size * 0.72);
  if (code) {
    return `<img src="https://flagcdn.com/w40/${code}.png" class="inline-flag-img" width="${size}" height="${height}" alt="${countryOrFlag}" loading="lazy" style="vertical-align: middle; border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.4);" onerror="this.outerHTML='${fallbackEmoji}'" />`;
  }
  return `<span class="inline-flag-emoji" style="vertical-align: middle;">${fallbackEmoji}</span>`;
}

/**
 * High-definition, cross-platform FlagIcon component.
 * Renders real colorful flag graphics on all operating systems (including Windows).
 */
export function FlagIcon({ country = '', code = null, emoji = '🚩', className = '', size = 'md', title = '' }) {
  const [hasError, setHasError] = useState(false);
  const resolvedCode = (code || getCountryCode(country) || '').toLowerCase();

  const width = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  const height = Math.round(width * 0.72);

  if (resolvedCode && !hasError) {
    return (
      <img
        src={`https://flagcdn.com/w40/${resolvedCode}.png`}
        srcSet={`https://flagcdn.com/w80/${resolvedCode}.png 2x`}
        width={width}
        height={height}
        alt={title || `${country} flag`}
        title={title || country}
        className={`inline-flag-img ${className}`}
        loading="lazy"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <span className={`inline-flag-emoji ${className}`} role="img" aria-label={country || 'flag'} title={title || country}>
      {emoji}
    </span>
  );
}

export default FlagIcon;

