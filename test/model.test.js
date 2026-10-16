// -----------------------------------------------------------------------------
// The feed list as Emoncms writes it: the real answer of Emoncms 11.9.10, the
// strings and nulls of other versions, and the stopped-feed rule.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gladysValue, shapeOf, tagId } from '../src/devices.js';
import { isStale, parseFeeds } from '../src/emoncms/model.js';
import { FEED_LIST } from './helpers/world.js';

test('the real feed list: ids, tags, units, values, times in ms, intervals', () => {
  const feeds = parseFeeds(FEED_LIST);
  assert.equal(feeds.length, 7);
  assert.deepEqual(feeds[3], {
    id: 4,
    tag: 'emontx',
    name: 'Flow temperature',
    unit: '°C',
    value: 21.7,
    time: FEED_LIST[3].time * 1000,
    interval: 10,
  });
});

test('strings, nulls, false, duplicates and junk', () => {
  const feeds = parseFeeds([
    { id: '9', tag: null, name: ' A ', unit: ' W ', value: '12.5', time: '1792140162' },
    { id: '10', value: false, time: 1792140162 },
    { id: '11', value: 3, time: 0 },
    { id: '9', value: 1, time: 1 },
    { id: 'x' },
    null,
  ]);
  assert.deepEqual(
    feeds.map((f) => [f.id, f.tag, f.name, f.unit, f.value]),
    [
      [9, '', 'A', 'W', 12.5],
      [10, '', '', '', null],
      [11, '', '', '', null],
    ],
  );
  assert.deepEqual(parseFeeds('false'), []);
});

test('a feed stops after the delay, or three of its intervals when longer', () => {
  const feed = { time: 0, interval: 10 };
  assert.equal(isStale(feed, 15 * 60_000, 15 * 60_000), false);
  assert.equal(isStale(feed, 15 * 60_000 + 1, 15 * 60_000), true);
  assert.equal(isStale({ time: 0, interval: 3600 }, 2 * 3600_000, 15 * 60_000), false);
  assert.equal(isStale(feed, 1e12, 0), false, 'off');
  assert.equal(isStale({ time: null }, 1e12, 60_000), false, 'never written');
});

test('values: rounding and unit conversion', () => {
  assert.equal(gladysValue({ unit: 'W', value: 1234.56 }), 1234.6);
  assert.equal(gladysValue({ unit: 'kWh', value: 0.0021305555 }), 0.002);
  assert.equal(gladysValue({ unit: 'L/min', value: 12.5 }), 0.75);
  assert.equal(gladysValue({ unit: 'Hz', value: 50.0234 }), 50.023);
  assert.equal(gladysValue({ unit: 'W', value: null }), null);
  assert.equal(shapeOf(' KWH ').definition.type, 'index');
});

test('tag ids: plain words verbatim, anything else hashed, stable', () => {
  assert.equal(tagId('emontx4'), 'emontx4');
  assert.match(tagId('Heat Pump'), /^_[0-9a-f]{12}$/);
  assert.equal(tagId('Heat Pump'), tagId('Heat Pump'));
  assert.notEqual(tagId('EmonTx'), tagId('emontx'));
  assert.match(tagId(''), /^_[0-9a-f]{12}$/);
});
