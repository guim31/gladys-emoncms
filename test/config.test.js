// -----------------------------------------------------------------------------
// Configuration parsing: the addresses users paste, API keys, the feed filter.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseApiKey, parseFeedIds, parseServerUrl } from '../src/config.js';

test('server addresses: bare host, sub-path, pasted page URLs, emoncms.org', () => {
  const cases = {
    '192.0.2.10': 'http://192.0.2.10',
    '192.0.2.10/emoncms': 'http://192.0.2.10/emoncms',
    'http://emonpi.local/emoncms/feed/view': 'http://emonpi.local/emoncms',
    'http://emonpi.local/feed/list': 'http://emonpi.local',
    'https://energy.example.org:8443/emoncms/app/view?name=MyElectric':
      'https://energy.example.org:8443/emoncms',
    'http://192.0.2.10/index.php': 'http://192.0.2.10',
    'emoncms.org': 'https://emoncms.org',
    'emoncms.org/user/login': 'https://emoncms.org',
    'http://emoncms.org': 'http://emoncms.org',
    ' 192.0.2.10/emoncms/ ': 'http://192.0.2.10/emoncms',
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(parseServerUrl(typed), expected, typed);
  }
  for (const bad of ['', 'ftp://192.0.2.10', 'http://user:pass@192.0.2.10', 'http://', 42]) {
    assert.equal(parseServerUrl(bad), null, String(bad));
  }
});

test('API keys: 32 hexadecimal characters, pasted with blanks or apikey=', () => {
  const key = '0123456789ABCDEF0123456789abcdef';
  assert.equal(parseApiKey(` ${key}\n`), key.toLowerCase());
  assert.equal(parseApiKey(`apikey=${key}`), key.toLowerCase());
  assert.equal(parseApiKey('0123'), null);
  assert.equal(parseApiKey(''), null);
});

test('feed filter: ids separated by commas, semicolons or blanks', () => {
  assert.deepEqual(parseFeedIds('1, 2;5 x 2 -3 12'), [1, 2, 5, 12]);
  assert.deepEqual(parseFeedIds(7), [7]);
  assert.deepEqual(parseFeedIds(''), []);
});

test('normalizeConfig: defaults, invalid values, the cloud', () => {
  const config = normalizeConfig({});
  assert.equal(config.url, null);
  assert.equal(config.pollIntervalMs, 10_000);
  assert.equal(config.staleAfterMs, 15 * 60_000);
  assert.equal(config.language, 'fr');
  const odd = normalizeConfig({
    url: 'emoncms.org',
    read_apikey: 'nope',
    write_apikey: 'nope',
    poll_interval: 7,
    stale_after: 0,
    language: 'it',
  });
  assert.equal(odd.cloud, true);
  assert.equal(odd.readKeyInvalid, true);
  assert.equal(odd.writeKeyInvalid, true);
  assert.equal(odd.pollIntervalMs, 10_000);
  assert.equal(odd.staleAfterMs, 0);
  assert.equal(odd.language, 'fr');
});
