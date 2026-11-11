import React from 'react';

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
 * Robust ISO code to Unicode Flag Emoji generator (avoids file encoding corruption)
 */
export function getUnicodeFlag(codeOrCountry = '') {
  if (!codeOrCountry) return '🚩';
  let code = String(codeOrCountry).trim().toLowerCase();
  if (code.length > 2) {
    code = getCountryCode(code) || '';
  }
  if (code.length === 2) {
    const c = code.toUpperCase();
    try {
      return String.fromCodePoint(127397 + c.charCodeAt(0), 127397 + c.charCodeAt(1));
    } catch {
      return '🚩';
    }
  }
  return '🚩';
}

/**
 * Resolve country name or string to 2-letter ISO country code
 */
export function getCountryCode(country = '') {
  if (!country) return null;
  const str = String(country).trim();
  if (str.length === 2) return str.toLowerCase();
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
 * Return raw HTML string for map markers / popups
 */
export function getFlagHtml(countryOrFlag = '', fallbackEmoji = '', size = 18) {
  const code = getCountryCode(countryOrFlag);
  const flagEmoji = fallbackEmoji || (code ? getUnicodeFlag(code) : '🚩');
  const height = Math.round(size * 0.72);

  if (code) {
    return `<span class="inline-flag-badge" style="display:inline-flex;align-items:center;vertical-align:middle;margin-right:4px;">
      <img src="https://flagcdn.com/w40/${code}.png"
           width="${size}"
           height="${height}"
           alt="${countryOrFlag}"
           style="border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,0.5);display:inline-block;"
           onerror="this.style.display='none';this.nextElementSibling.style.display='inline';" />
      <span class="flag-fallback" style="display:none;font-size:${size}px;">${flagEmoji}</span>
    </span>`;
  }

  return `<span class="inline-flag-emoji" style="vertical-align:middle;font-size:${size}px;">${flagEmoji}</span>`;
}

/**
 * High-definition, cross-platform FlagIcon component.
 * Renders colorful flag graphics with instant emoji fallback.
 */
export function FlagIcon({ country = '', code = null, emoji = '', className = '', size = 'md', title = '' }) {
  const [imgError, setImgError] = React.useState(false);
  const resolvedCode = (code || getCountryCode(country) || '').toLowerCase();
  const flagEmoji = emoji || getUnicodeFlag(resolvedCode || country);

  const width = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  const height = Math.round(width * 0.72);

  if (resolvedCode && !imgError) {
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
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          borderRadius: '2px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={`inline-flag-emoji ${className}`}
      role="img"
      aria-label={country || 'flag'}
      title={title || country}
      style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: `${width}px`, lineHeight: 1 }}
    >
      {flagEmoji}
    </span>
  );
}

export default FlagIcon;
