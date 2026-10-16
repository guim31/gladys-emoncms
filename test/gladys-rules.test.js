// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// feed list of an Emoncms 11.9.10 server (test/fixtures/emoncms/), plus one
// feed for every unit the integration knows, units it does not know, a feed
// without a tag, a tag that is not a plain word and two feeds of the same name.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KNOWN_UNITS } from '../src/devices.js';
import { FEED_LIST, FakeEmoncms, RECORDED_AT, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

function feedList() {
  const feeds = structuredClone(FEED_LIST);
  const extra = [...KNOWN_UNITS, 'Hz', 'kWh/d', '', 'furlongs'];
  extra.forEach((unit, index) => {
    feeds.push({
      id: String(100 + index),
      userid: '1',
      name: `Unit ${unit || 'none'}`,
      tag: 'units',
      engine: '5',
      unit,
      value: 12.5,
      time: RECORDED_AT,
      interval: 10,
    });
  });
  feeds.push(
    { id: '200', name: 'Solar', tag: '', unit: 'W', value: 800, time: RECORDED_AT },
    { id: '201', name: 'Power', tag: 'Heat Pump (emonHP)', unit: 'W', value: 1, time: RECORDED_AT },
    { id: '202', name: 'Power', tag: 'Heat Pump (emonHP)', unit: 'W', value: 2, time: RECORDED_AT },
    { id: '203', name: 'Never written', tag: 'units', unit: 'W', value: null, time: 0 },
  );
  return feeds;
}

async function discover(language) {
  const world = await createWorld({
    emoncms: new FakeEmoncms({ feeds: feedList() }),
    config: {
      url: '192.0.2.10/emoncms',
      read_apikey: '0123456789abcdef0123456789abcdef',
      language,
    },
  });
  await world.app.stop();
  return world.fake.discoveredDevices;
}

test('the fixtures cover the real tags, every known unit, no tag and odd tags', async () => {
  const devices = await discover('en');
  assert.deepEqual(
    devices.map((device) => device.name),
    ['emontx', 'emonpi', 'units', 'Emoncms', 'Heat Pump (emonHP)'],
  );
  const units = devices.find((device) => device.name === 'units');
  assert.equal(units.features.length, KNOWN_UNITS.length + 5);
});

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every discovered device follows the Gladys rules (${language})`, async () => {
    const devices = await discover(language);
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          const allowed = table.units_by_category[feature.category];
          if (allowed) {
            assert.ok(
              allowed.includes(feature.unit),
              `${at}: ${feature.unit} in ${feature.category}`,
            );
          }
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
