// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Emoncms server and a
// manual clock, with the integration wired on top through registerHandlers.
// No timer runs unless `timers` is set: the tests read Emoncms with
// `world.hub.pollNow()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { deviceIds, featureKey } from '../../src/devices.js';
import {
  BASE_URL,
  FEED_LIST,
  FakeEmoncms,
  READ_KEY,
  RECORDED_AT,
  WRITE_KEY,
} from './fakeEmoncms.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests: starts when the fixture was recorded. */
export function createClock(start = RECORDED_AT * 1000 + 5000) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
    seconds: () => Math.floor(clock.time / 1000),
  };
  return clock;
}

export const BASE_CONFIG = {
  url: '192.0.2.10/emoncms/feed/view',
  read_apikey: READ_KEY,
  language: 'en',
};

export async function createWorld({
  clock = createClock(),
  emoncms = new FakeEmoncms(),
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    request: emoncms.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, emoncms, app, hub: app.hub, clock };
}

export const deviceId = (gladys, tag) => deviceIds(gladys, tag).device;
export const feedFeatureId = (gladys, tag, feedId) =>
  deviceIds(gladys, tag).feature(featureKey(feedId));

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

/** The states published so far, as { external id: last value }. */
export function lastStates(world) {
  const states = {};
  for (const state of world.fake.states) {
    states[state.device_feature_external_id] = state.state;
  }
  return states;
}

export { BASE_URL, FEED_LIST, FakeEmoncms, READ_KEY, RECORDED_AT, WRITE_KEY };
