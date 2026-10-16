// -----------------------------------------------------------------------------
// The logs the Gladys supervisor keeps: at the info level, only the life
// cycle. A normal reading cycle (reads, states, scene events, values sent)
// writes nothing; a failure that repeats at every read writes one line, then
// one when it heals; an API key never appears. The SDK logger writes
// debug/info with console.log, warn/error with console.error, at the level of
// LOG_LEVEL read on every line.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CONFIG, READ_KEY, WRITE_KEY, createDevices, createWorld } from './helpers/world.js';

/** The lines written at `LOG_LEVEL` from now on. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function world(t) {
  const w = await createWorld({ config: { ...BASE_CONFIG, write_apikey: WRITE_KEY } });
  t.after(() => w.app.stop());
  await createDevices(w);
  return w;
}

test('a normal cycle writes nothing: reads, states, scene events, values sent', async (t) => {
  const w = await world(t);
  const lines = captureLogs(t);
  for (let read = 0; read < 30; read += 1) {
    w.clock.advance(60_000);
    // emonpi stops after a while (scene event), emontx keeps changing.
    for (const feed of w.emoncms.feeds.filter((f) => f.tag === 'emontx')) {
      feed.time = w.clock.seconds();
      feed.value += 1;
    }
    await w.hub.pollNow();
    await w.fake.sceneAction('send_value', { node: 'gladys', input: 'x', value: String(read) });
  }
  assert.ok(w.fake.sceneEvents.length > 0);
  assert.deepEqual(lines, []);
});

test('an outage writes one line, its end another', async (t) => {
  const w = await world(t);
  const lines = captureLogs(t);
  w.emoncms.failure = 'down';
  for (let read = 0; read < 5; read += 1) {
    await w.hub.pollNow();
  }
  w.emoncms.failure = null;
  await w.hub.pollNow();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /192\.0\.2\.10\/emoncms: no answer \(ECONNREFUSED\)/);
  assert.match(lines[1], /answers again/);
});

test('no API key in the logs, even in debug', async (t) => {
  const lines = captureLogs(t, 'debug');
  const w = await world(t);
  await w.fake.action('test_connection', {});
  await w.fake.sceneAction('send_value', { node: 'gladys', input: 'x', value: '1' });
  w.emoncms.failure = 'down';
  await w.hub.pollNow();
  assert.ok(lines.length > 3);
  for (const line of lines) {
    assert.ok(!line.includes(READ_KEY) && !line.includes(WRITE_KEY), line);
  }
});
