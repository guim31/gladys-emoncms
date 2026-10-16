// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the hub, so index.js stays a few lines and the tests drive the
// very same wiring. (Adapted from guim31/gladys-netdata.)
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { EmoncmsHub } from './hub.js';
import { SCENE_ACTIONS } from './scenes.js';
import { INIT_FAILED } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'emoncms-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: request, timers, timings, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new EmoncmsHub({
    gladys,
    request: options.request,
    timers: options.timers ?? true,
    timings: options.timings,
    now: options.now,
  });

  // Resolved once the hub has started; every handler waits for it, so a
  // request arriving during the first read is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let startup = null;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (startup) {
        // A reconnection (Gladys restarted): send again what Gladys may have
        // lost, once the first start is over.
        await startup.catch(() => {});
        await hub.resync(config);
        return;
      }
      // Set before any await: two quick connections start the hub once.
      startup = hub.start(config);
      await startup;
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.rediscover()));

  // The devices are published with should_poll: false (the hub reads Emoncms
  // on its own timer); this only serves a Gladys that would poll anyway.
  gladys.onPoll(whenReady(() => hub.pollDevice()));

  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  // "Update" in the Discovery tab adds the new feeds: their values were
  // dropped by Gladys until then.
  gladys.onDeviceUpdated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceDeleted(whenReady(async (device) => hub.onDeviceDeleted(device)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      await hub.reconfigure(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    'test_connection',
    whenReady(() => hub.testConnection()),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
