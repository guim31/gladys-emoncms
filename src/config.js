// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['5', '10', '30', '60', '300'];

// A feed not updated for this long (minutes) counts as stopped; '0' never.
export const STALE_AFTER = ['0', '5', '15', '60', '360', '1440'];

// The hosted service: same API, the cloud badge.
export const CLOUD_HOST = 'emoncms.org';

export const DEFAULT_CONFIG = {
  url: '',
  read_apikey: '',
  write_apikey: '',
  feeds: '',
  poll_interval: '10',
  stale_after: '15',
  language: 'fr',
};

// What may follow the root of Emoncms in a URL copied from the browser: a page
// (`/feed/view`, `/app/view?name=…`, `/user/login`) or `index.php`. The client
// adds `/feed/list.json` on its own.
const PAGE_PATH =
  /\/(index\.php|(feed|input|user|app|graph|dashboard|vis|admin|device|config)(\/.*)?)$/i;

/** Emoncms API keys: 32 hexadecimal characters. */
const API_KEY = /^[0-9a-f]{32}$/i;

/** True when the host is emoncms.org (or one of its sub-domains). */
export const isCloudHost = (hostname) =>
  hostname === CLOUD_HOST || hostname.endsWith(`.${CLOUD_HOST}`);

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, `emonpi.local/emoncms`), or the URL copied from the browser
 * (`http://emonpi.local/emoncms/feed/view`). HTTP by default, HTTPS for
 * emoncms.org. A sub-path is kept (`/emoncms` on an emonPi or a shared server).
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the messages.
  if (url.username || url.password) {
    return null;
  }
  if (!hasScheme && isCloudHost(url.hostname)) {
    url.protocol = 'https:';
  }
  const path = url.pathname.replace(/\/+$/, '').replace(PAGE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host and path shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/** The feed ids typed by the user: comma, semicolon or space separated. */
export function parseFeedIds(raw) {
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string') {
    return [];
  }
  const ids = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (/^\d{1,9}$/.test(part) && !ids.includes(Number(part))) {
      ids.push(Number(part));
    }
  }
  return ids;
}

/** An API key as pasted: blanks trimmed, `apikey=` prefix dropped. Null when not a key. */
export function parseApiKey(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const key = raw.trim().replace(/^apikey=/i, '');
  if (!key) {
    return null;
  }
  return API_KEY.test(key) ? key.toLowerCase() : null;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typedUrl = text('url');
  const url = parseServerUrl(typedUrl);
  const typedWrite = text('write_apikey');
  return {
    url,
    urlInvalid: Boolean(typedUrl) && !url,
    cloud: url ? isCloudHost(new URL(url).hostname) : false,
    readKey: parseApiKey(source.read_apikey),
    readKeyInvalid: Boolean(text('read_apikey')) && !parseApiKey(source.read_apikey),
    writeKey: parseApiKey(source.write_apikey),
    writeKeyInvalid: Boolean(typedWrite) && !parseApiKey(typedWrite),
    feedIds: parseFeedIds(source.feeds),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    staleAfterMs: Number(pick('stale_after', STALE_AFTER)) * 60_000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
