// -----------------------------------------------------------------------------
// The hub against a fake Emoncms answering what Emoncms 11.9.10 answered:
// discovery, units, states (changes only, heartbeat, stopped feeds), scene
// events, errors and recovery, the feed filter, the state budget, the timer
// of the container, the connection test, the scene action and the widget.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEED_STATUS, TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  BASE_CONFIG,
  FakeEmoncms,
  WRITE_KEY,
  createClock,
  createDevices,
  createWorld,
  deviceId,
  feedFeatureId,
  lastStates,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const byName = (device, name) => device.features.find((feature) => feature.name === name);

test('one device per tag, one feature per feed, units mapped to Gladys types', async (t) => {
  const w = await world(t);
  const [emontx, emonpi] = w.fake.discoveredDevices;
  assert.equal(emontx.name, 'emontx');
  assert.equal(emontx.external_id, deviceId(w.gladys, 'emontx'));
  assert.equal(emontx.should_poll, false);
  assert.equal(emontx.poll_frequency, undefined);
  const pick = (feature) => [feature.category, feature.type, feature.unit];
  assert.deepEqual(pick(byName(emontx, 'Heat pump power')), ['energy-sensor', 'power', 'watt']);
  assert.deepEqual(pick(byName(emontx, 'Heat pump energy')), [
    'energy-sensor',
    'index',
    'kilowatt-hour',
  ]);
  assert.deepEqual(pick(byName(emontx, 'Voltage')), ['energy-sensor', 'voltage', 'volt']);
  assert.deepEqual(pick(byName(emontx, 'Flow temperature')), [
    'temperature-sensor',
    'decimal',
    'celsius',
  ]);
  assert.deepEqual(pick(byName(emontx, 'Flow rate')), [
    'water-valve',
    'flow',
    'cubic-meter-per-hour',
  ]);
  // Hz: no Gladys unit, the name carries it and nothing is invented.
  assert.deepEqual(pick(byName(emonpi, 'Frequency (Hz)')), ['unknown', 'unknown', undefined]);
  // Grid power is signed (export): symmetric bounds.
  const grid = byName(emonpi, 'Grid power');
  assert.equal(grid.min, -grid.max);
  assert.equal(byName(emontx, 'Heat pump power').external_id, feedFeatureId(w.gladys, 'emontx', 1));
  // Nothing published before the user adds a device.
  assert.equal(w.fake.states.length, 0);
});

test('adding a device publishes its values, converted; then only the changes', async (t) => {
  const w = await world(t);
  await createDevices(w, (device) => device.name === 'emontx');
  const states = lastStates(w);
  assert.equal(states[feedFeatureId(w.gladys, 'emontx', 1)], 370);
  assert.equal(states[feedFeatureId(w.gladys, 'emontx', 2)], 0.002);
  // 12.5 L/min = 0.75 m³/h.
  assert.equal(states[feedFeatureId(w.gladys, 'emontx', 5)], 0.75);
  assert.equal(states[feedFeatureId(w.gladys, 'emonpi', 6)], undefined, 'emonpi not added');
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
  assert.ok(
    w.fake.transports.some(
      (entry) =>
        entry.device_external_id === deviceId(w.gladys, 'emontx') && entry.transport === 'local',
    ),
  );

  const before = w.fake.states.length;
  w.clock.advance(10_000);
  w.emoncms.touchAll(w.clock.seconds());
  await w.hub.pollNow();
  assert.equal(w.fake.states.length, before, 'nothing changed, nothing sent');

  w.emoncms.set(1, 1234.56, w.clock.seconds());
  await w.hub.pollNow();
  assert.deepEqual(w.fake.states.slice(before), [
    { device_feature_external_id: feedFeatureId(w.gladys, 'emontx', 1), state: 1234.6 },
  ]);
});

test('an unchanged value is sent again after 6 hours, while its feed updates', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const before = w.fake.states.length;
  for (let hour = 1; hour <= 6; hour += 1) {
    w.clock.advance(3600_000);
    w.emoncms.touchAll(w.clock.seconds());
    await w.hub.pollNow();
  }
  assert.equal(w.fake.states.length - before, 7, 'the seven feeds once');
});

test('a stopped feed: no stale value sent, a scene event, then back', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const before = w.fake.states.length;
  // emontx keeps updating, emonpi stops.
  const emontx = w.emoncms.feeds.filter((feed) => feed.tag === 'emontx');
  for (let minute = 1; minute <= 16; minute += 1) {
    w.clock.advance(60_000);
    for (const feed of emontx) {
      feed.time = w.clock.seconds();
    }
    await w.hub.pollNow();
  }
  const stopped = w.fake.sceneEvents.filter((event) => event.key === TRIGGERS.FEED_STATUS);
  assert.deepEqual(
    stopped.map((event) => [event.data.feed_id, event.data.status]),
    [
      [6, FEED_STATUS.STOPPED],
      [7, FEED_STATUS.STOPPED],
    ],
  );
  assert.equal(stopped[0].data.device, deviceId(w.gladys, 'emonpi'));
  assert.equal(stopped[0].data.device_name, 'emonpi');
  assert.equal(stopped[0].data.status_label, 'Stopped');
  assert.equal(stopped[0].data.minutes, 15);
  assert.equal(stopped[0].data.value, -122);

  // Six hours later, emonpi is still silent: its old value is never sent again.
  for (let hour = 1; hour <= 6; hour += 1) {
    w.clock.advance(3600_000);
    for (const feed of emontx) {
      feed.time = w.clock.seconds();
    }
    await w.hub.pollNow();
  }
  const emonpiIds = [6, 7].map((id) => feedFeatureId(w.gladys, 'emonpi', id));
  assert.ok(
    !w.fake.states.slice(before).some((s) => emonpiIds.includes(s.device_feature_external_id)),
  );
  // Nor on "Update" in the Discovery tab.
  await w.fake.deviceUpdated(w.fake.discoveredDevices[1]);
  assert.ok(
    !w.fake.states.slice(before).some((s) => emonpiIds.includes(s.device_feature_external_id)),
  );

  w.emoncms.set(6, -50, w.clock.seconds());
  w.emoncms.set(7, 50.01, w.clock.seconds());
  await w.hub.pollNow();
  const events = w.fake.sceneEvents.filter((event) => event.data.status === FEED_STATUS.RESUMED);
  assert.deepEqual(
    events.map((event) => event.data.feed_id),
    [6, 7],
  );
  assert.equal(lastStates(w)[emonpiIds[0]], -50);
});

test('a feed already stopped at the first read fires nothing', async (t) => {
  const emoncms = new FakeEmoncms();
  emoncms.set(6, -122, emoncms.feeds[5].time - 3600);
  const w = await world(t, { emoncms });
  await w.hub.pollNow();
  assert.deepEqual(w.fake.sceneEvents, []);
  await createDevices(w);
  assert.equal(lastStates(w)[feedFeatureId(w.gladys, 'emonpi', 6)], undefined);
  assert.equal(lastStates(w)[feedFeatureId(w.gladys, 'emonpi', 7)], 50.02);
});

test('"Never" turns the stopped-feed check off; a daily feed waits three intervals', async (t) => {
  const emoncms = new FakeEmoncms();
  const w = await world(t, { emoncms, config: { ...BASE_CONFIG, stale_after: '0' } });
  await createDevices(w);
  w.clock.advance(48 * 3600_000);
  await w.hub.pollNow();
  assert.deepEqual(w.fake.sceneEvents, []);

  const daily = new FakeEmoncms();
  for (const feed of daily.feeds) {
    feed.interval = 86400;
  }
  const d = await world(t, { emoncms: daily });
  d.clock.advance(2 * 86400_000);
  await d.hub.pollNow();
  assert.deepEqual(d.fake.sceneEvents, [], 'two days: still within three intervals');
  d.clock.advance(1.5 * 86400_000);
  await d.hub.pollNow();
  assert.equal(d.fake.sceneEvents.length, 7);
});

test('errors: refused key, Emoncms down, not Emoncms; then recovery', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, read_apikey: 'ab'.repeat(16) } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /API key refused/);
  assert.deepEqual(w.fake.discoveredDevices, []);

  const ok = await world(t);
  await createDevices(ok);
  ok.emoncms.failure = 'down';
  await ok.hub.pollNow();
  assert.equal(ok.fake.connectionStatus.connected, false);
  assert.match(ok.fake.connectionStatus.message.fr, /ne répond pas/);
  assert.ok(ok.fake.transports.some((entry) => entry.transport === 'unreachable'));
  // The devices stay in the Discovery list while Emoncms is down.
  assert.equal(ok.fake.discoveredDevices.length, 2);

  ok.emoncms.failure = 'html';
  await ok.hub.pollNow();
  assert.match(ok.fake.connectionStatus.message.en, /No Emoncms API/);

  ok.emoncms.failure = null;
  ok.emoncms.touchAll(ok.clock.seconds());
  await ok.hub.pollNow();
  assert.equal(ok.fake.connectionStatus.connected, true);
  assert.equal(ok.fake.transports.at(-1).transport, 'local');
});

test('the configuration: missing or malformed address and key', async (t) => {
  const cases = [
    [{}, /Enter the address/],
    [{ url: 'ftp://x' }, /Address not understood/],
    [{ url: '192.0.2.10/emoncms' }, /read API key/],
    [{ url: '192.0.2.10/emoncms', read_apikey: 'not-a-key' }, /32 characters/],
  ];
  for (const [config, message] of cases) {
    const w = await world(t, { config: { ...config, language: 'en' } });
    assert.equal(w.fake.connectionStatus.connected, false);
    assert.match(w.fake.connectionStatus.message.en, message);
    assert.equal(w.emoncms.requests.length, 0);
  }
});

test('emoncms.org: HTTPS, and the cloud badge', async (t) => {
  const emoncms = new FakeEmoncms({ url: 'https://emoncms.org' });
  const w = await world(t, { emoncms, config: { ...BASE_CONFIG, url: 'emoncms.org' } });
  await createDevices(w);
  assert.ok(w.emoncms.requests[0].startsWith('https://emoncms.org/feed/list.json'));
  assert.ok(w.fake.transports.every((entry) => entry.transport === 'cloud'));
});

test('the API key travels in a header, never in the URL', async (t) => {
  const seen = [];
  const emoncms = new FakeEmoncms();
  const request = emoncms.request;
  emoncms.request = (url, options) => {
    seen.push({ url, options });
    return request(url, options);
  };
  const w = await world(t, {
    emoncms,
    config: { ...BASE_CONFIG, write_apikey: WRITE_KEY },
  });
  await w.fake.action('test_connection', {});
  await w.fake.sceneAction('send_value', { node: 'gladys', input: 'x', value: '1' });
  assert.ok(seen.length >= 3);
  for (const { url, options } of seen) {
    assert.doesNotMatch(url, /apikey|[0-9a-f]{32}/);
    assert.match(options.headers.authorization, /^Bearer [0-9a-f]{32}$/);
  }
});

test('the feed filter keeps the listed feeds only', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, feeds: '1, 2;6 x 99' } });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => [device.name, device.features.length]),
    [
      ['emontx', 2],
      ['emonpi', 1],
    ],
  );
  // A new filter publishes the Discovery list again.
  await w.fake.configUpdated({ ...BASE_CONFIG, feeds: '' });
  assert.equal(w.fake.discoveredDevices[0].features.length, 5);
});

test('at most 240 states a minute, every feed in turn', async (t) => {
  const emoncms = new FakeEmoncms({ feeds: [] });
  for (let id = 1; id <= 300; id += 1) {
    emoncms.feeds.push({ id: String(id), tag: 'big', name: `F${id}`, unit: 'W', value: id });
  }
  const clock = createClock(Date.UTC(2026, 9, 16, 10));
  emoncms.touchAll(clock.seconds());
  const w = await world(t, { emoncms, clock });
  // Added by the user: the budget holds for the first publication too.
  await createDevices(w);
  assert.equal(w.fake.states.length, 240);
  for (const feed of emoncms.feeds) {
    feed.value += 1;
  }
  w.clock.advance(61_000);
  emoncms.touchAll(w.clock.seconds());
  await w.hub.pollNow();
  assert.equal(w.fake.states.length, 480);
  const sent = new Set(w.fake.states.map((state) => state.device_feature_external_id));
  assert.equal(sent.size, 300, 'the 60 never sent went first');
  w.clock.advance(61_000);
  emoncms.touchAll(w.clock.seconds());
  await w.hub.pollNow();
  assert.equal(w.fake.states.length, 540, 'the 60 left waiting');
});

test('the container reads Emoncms on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, { timers: true, config: { ...BASE_CONFIG, poll_interval: '30' } });
  const reads = () => w.emoncms.requests.length;
  assert.equal(reads(), 1);
  for (let i = 0; i < 3; i += 1) {
    t.mock.timers.tick(30_000);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(reads(), 4);
});

test('Test the connection: feeds, devices, stopped feeds and the write key', async (t) => {
  const none = await world(t);
  const ack = await none.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    '192.0.2.10/emoncms: OK, 7 feed(s), 2 device(s) to add, no write key: sending is off',
  );

  const good = await world(t, { config: { ...BASE_CONFIG, write_apikey: ` ${WRITE_KEY}\n` } });
  assert.match((await good.fake.action('test_connection', {})).data.message.fr, /envoi actif/);

  const read = await world(t, {
    config: { ...BASE_CONFIG, write_apikey: BASE_CONFIG.read_apikey },
  });
  assert.match(
    (await read.fake.action('test_connection', {})).data.message.en,
    /write key refused/,
  );

  const broken = await world(t, { config: { ...BASE_CONFIG, read_apikey: '' } });
  assert.match((await broken.fake.action('test_connection', {})).data.message.en, /read API key/);
});

test('Send a value to Emoncms: posts a number, refuses what Emoncms would not take', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, write_apikey: WRITE_KEY } });
  const ack = await w.fake.sceneAction('send_value', {
    node: 'gladys',
    input: 'living_room',
    value: ' 21,5 ',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { sent: true });
  assert.deepEqual(w.emoncms.posts, [{ node: 'gladys', values: { living_room: 21.5 } }]);

  for (const [fields, message] of [
    [{ node: 'gladys', input: 'x', value: 'warm' }, /not a number/],
    [{ node: 'gla/dys', input: 'x', value: '1' }, /letters, digits/],
    [{ node: 'gladys', input: '', value: '1' }, /letters, digits/],
  ]) {
    const refused = await w.fake.sceneAction('send_value', fields);
    assert.equal(refused.success, false);
    assert.match(refused.error, message);
  }

  const noKey = await world(t);
  const refused = await noKey.fake.sceneAction('send_value', { node: 'a', input: 'b', value: 1 });
  assert.match(refused.error, /write API key/);

  const readKey = await world(t, {
    config: { ...BASE_CONFIG, write_apikey: BASE_CONFIG.read_apikey },
  });
  const wrong = await readKey.fake.sceneAction('send_value', { node: 'a', input: 'b', value: 1 });
  assert.match(wrong.error, /API key refused/);
});

test('the widget: overview, a device, its stopped feeds; within the budget', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const get = async (settings, language = 'en') => {
    const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    return ack.data.content.components;
  };
  const overview = await get({});
  assert.deepEqual(
    overview.filter((c) => c.type === 'value').map((c) => c.value),
    [7, 0],
  );
  assert.deepEqual(
    overview.find((c) => c.type === 'status').items.map((row) => [row.label, row.value]),
    [
      ['emontx', '5 feeds'],
      ['emonpi', '2 feeds'],
    ],
  );

  const device = await get({ device: deviceId(w.gladys, 'emontx') }, 'fr');
  const tiles = device.filter((c) => c.type === 'value');
  assert.equal(tiles.length, 5);
  const features = w.fake.discoveredDevices[0].features.map((f) => f.external_id);
  for (const tile of tiles) {
    assert.ok(features.includes(tile.device_feature), 'bound to a published feature');
  }
  assert.equal(device.find((c) => c.type === 'status').items[0].value, 'Tous les flux sont à jour');

  w.clock.advance(3 * 3600_000);
  await w.hub.pollNow();
  const stale = await get({ device: deviceId(w.gladys, 'emonpi') }, 'de');
  assert.deepEqual(
    stale.find((c) => c.type === 'status').items.map((row) => row.value),
    ['gestoppt: 3 Std.', 'gestoppt: 3 Std.'],
  );
  const unknown = await get({ device: deviceId(w.gladys, 'nothing') });
  assert.equal(unknown[0].type, 'text');

  w.emoncms.failure = 'down';
  await w.hub.pollNow();
  const down = await get({});
  assert.equal(down.find((c) => c.type === 'status').items[0].value, 'Emoncms unreachable');
});

test('a reconnection of Gladys sends everything again', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const before = w.fake.states.length;
  await w.gladys.connect();
  await w.hub.polling;
  assert.ok(w.fake.states.length >= before + 7);
});

test('changing the stopped-feed delay fires nothing by itself', async (t) => {
  const w = await world(t);
  w.clock.advance(30 * 60_000);
  await w.hub.pollNow();
  assert.equal(w.fake.sceneEvents.length, 7, 'every feed stopped');
  for (const stale_after of ['0', '1440', '15']) {
    await w.fake.configUpdated({ ...BASE_CONFIG, stale_after });
  }
  await w.hub.pollNow();
  assert.equal(w.fake.sceneEvents.length, 7);
});

test('a configuration changed during a read reads the new server at once', async (t) => {
  const w = await world(t);
  const other = new FakeEmoncms({ url: 'http://198.51.100.20' });
  const request = w.emoncms.request;
  let release;
  w.emoncms.request = (url, options) =>
    url.startsWith('http://198.51.100.20')
      ? other.request(url, options)
      : new Promise((resolve) => {
          release = () => resolve(request(url, options));
        });
  // registerHandlers captured the seam: route through the hub's client.
  w.hub.request = (url, options) => w.emoncms.request(url, options);
  w.hub.client.request = w.hub.request;
  const reading = w.hub.pollNow();
  const reconfigured = w.fake.configUpdated({ ...BASE_CONFIG, url: '198.51.100.20' });
  release();
  await reading;
  await reconfigured;
  assert.equal(other.requests.length, 1);
  assert.equal(w.hub.readAt > 0, true);
});

test('a failed first read leaves the Discovery list alone', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, read_apikey: 'ab'.repeat(16) } });
  await w.fake.action('test_connection', {});
  assert.equal(w.fake.discoveredDevices.length, 0);
});

test('a feed without a name keeps its widget row; the node defaults to gladys', async (t) => {
  const emoncms = new FakeEmoncms();
  emoncms.feeds[5].name = '';
  emoncms.feeds[5].value = null;
  const w = await world(t, { emoncms, config: { ...BASE_CONFIG, write_apikey: WRITE_KEY } });
  await createDevices(w);
  const ack = await w.fake.widgetGet(WIDGET_KEY, {
    settings: { device: deviceId(w.gladys, 'emonpi') },
  });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const rows = ack.data.content.components.find((c) => c.type === 'status').items;
  assert.equal(rows[0].label, '#6');
  const sent = await w.fake.sceneAction('send_value', { node: ' ', input: 'x', value: '2' });
  assert.equal(sent.success, true, sent.error);
  assert.equal(w.emoncms.posts[0].node, 'gladys');
});
