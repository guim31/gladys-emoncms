// -----------------------------------------------------------------------------
// The feed list of Emoncms, normalized. Emoncms answers numbers as strings
// on older versions and in some columns ("id": "1", "size": "0"), a value
// `null` or `false` for a feed never written, and `time` in seconds.
// -----------------------------------------------------------------------------

const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
};

/**
 * @param {Array<object>} list the answer of /feed/list.json?meta=1
 * @returns {Array<{ id: number, tag: string, name: string, unit: string,
 *   value: number|null, time: number|null, interval: number|null }>} time in ms
 */
export function parseFeeds(list) {
  const feeds = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const id = toNumber(raw.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const time = toNumber(raw.time);
    const interval = toNumber(raw.interval);
    const value = toNumber(raw.value);
    feeds.push({
      id,
      tag: typeof raw.tag === 'string' ? raw.tag.trim() : '',
      name: typeof raw.name === 'string' ? raw.name.trim() : '',
      unit: typeof raw.unit === 'string' ? raw.unit.trim() : '',
      // A feed never written has time 0 or null: no value to show.
      value: time ? value : null,
      time: time ? time * 1000 : null,
      interval: interval && interval > 0 ? interval : null,
    });
  }
  return feeds;
}

/**
 * Whether a feed still updates: its last value is younger than the larger of
 * the configured delay and three of its intervals (a daily feed is not
 * "stopped" after 15 minutes). A delay of 0 turns the check off.
 */
export function isStale(feed, now, staleAfterMs) {
  if (feed.time === null || staleAfterMs <= 0) {
    return false;
  }
  const threshold = Math.max(staleAfterMs, (feed.interval ?? 0) * 3000);
  return now - feed.time > threshold;
}
