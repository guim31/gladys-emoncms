// -----------------------------------------------------------------------------
// The Emoncms hub: reads the feed list of the account on a timer of the
// container (5 s to 5 min, 10 s by default), one request per cycle for every
// feed, and turns it into devices (one per tag), states, scene events and the
// connection status.
//
// Gladys never polls these devices (should_poll: false): one grouped read
// serves every device, and the scene events must fire for every feed, added
// to Gladys or not.
//
// The 300 states per minute of Gladys: only the devices added are published,
// only what changed (rounded), and a budget of 240 states per minute on top,
// the oldest published first. An unchanged value is sent again after 6 hours,
// before the core marks it outdated, but only while its feed still updates:
// the last value of a stopped feed is never presented as a fresh one.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { EmoncmsClient, ERROR_KINDS } from './emoncms/client.js';
import { isStale, parseFeeds } from './emoncms/model.js';
import { hostOf } from './config.js';
import {
  UNTAGGED_NAME,
  buildDevice,
  deviceIds,
  featureKey,
  gladysValue,
  groupByTag,
  parseDeviceId,
  tagId,
} from './devices.js';
import { createIssueLog } from './logs.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  FEED_STATUS_TEXT,
  REPORT_TEXT,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'emoncms-hub' });

export const WIDGET_KEY = 'feeds';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  FEED_STATUS: 'feed_status_changed',
});

export const FEED_STATUS = Object.freeze({ STOPPED: 'stopped', RESUMED: 'resumed' });

export const HUB_TIMINGS = {
  // An unchanged value is sent again after this long.
  heartbeatMs: 6 * 3600_000,
  // States sent per minute at most, below the 300 of Gladys.
  statesPerMinute: 240,
};

// States and transports per request, at most (SDK limit).
const MAX_PER_REQUEST = 100;

// Node and input names Emoncms keeps as typed (it strips anything else).
const INPUT_NAME = /^[\p{L}\p{N}_.\- ]{1,64}$/u;

const signature = (config) => JSON.stringify([config.url, config.readKey]);

export class EmoncmsHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/emoncms/client.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.signature = null;
    this.client = null;
    /** Every feed read at the last successful read (after the feed filter). */
    this.feeds = [];
    this.error = null;
    this.readAt = 0;
    this.polling = null;
    /** Whether each feed was stale at the last read, by feed id. */
    this.stale = new Map();
    this.published = new Map();
    this.publishedAt = new Map();
    this.sentTimes = [];
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.pollTimer = null;
    this.stopped = false;
    this.issues = createIssueLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.publishedAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (this.signature !== signature(config)) {
      // Another server or account: its feeds are other feeds.
      this.signature = signature(config);
      this.client = config.url
        ? new EmoncmsClient({ url: config.url, request: this.request })
        : null;
      this.feeds = [];
      this.stale.clear();
      this.error = null;
      this.readAt = 0;
    }
    if (
      previous?.language !== config.language ||
      JSON.stringify(previous?.feedIds) !== JSON.stringify(config.feedIds)
    ) {
      this.discovered = null;
    }
    await this.pollNow({ publish: true });
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.polling?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.readable()) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.issues.ok('poll', 'Polling works again');
      } catch (err) {
        this.issues.fail('poll', 'error', 'Poll failed', err);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  readable() {
    return Boolean(this.client && this.config?.readKey);
  }

  // --- Identities ----------------------------------------------------------------

  /** The tag ids of the devices the user added. */
  createdTagIds() {
    const ids = new Set();
    for (const device of this.gladys.devices ?? []) {
      const id = parseDeviceId(this.gladys, device.external_id);
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** The tag of a device external id, null when no feed has it. */
  tagOf(externalId) {
    const id = parseDeviceId(this.gladys, externalId);
    if (id === null) {
      return null;
    }
    const feed = this.feeds.find((f) => tagId(f.tag) === id);
    return feed ? feed.tag : null;
  }

  isFeedStale(feed) {
    return isStale(feed, this.now(), this.config.staleAfterMs);
  }

  // --- Devices -----------------------------------------------------------------

  discoveredDevices() {
    return [...groupByTag(this.feeds)].map(([tag, feeds]) => buildDevice(this.gladys, tag, feeds));
  }

  /** Publish the Discovery list when it changed (a feed created, renamed, moved…). */
  async publishDevices({ force = false } = {}) {
    if (this.readAt === 0 && !force) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.issues.ok('discovery', 'Discovered devices accepted again');
    } catch (err) {
      this.issues.fail('discovery', 'warn', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Emoncms, publish the list again. */
  async rediscover() {
    await this.pollNow();
    await this.publishDevices({ force: true });
  }

  /** Gladys asks for a refresh (onPoll): read again unless a read is recent. */
  async pollDevice() {
    if (this.now() - this.readAt >= (this.config?.pollIntervalMs ?? 0) / 2) {
      await this.pollNow();
    }
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const tag = this.tagOf(device.external_id);
    if (tag === null) {
      return;
    }
    this.transports.delete(device.external_id);
    await this.sendStates(
      this.feeds.filter((feed) => feed.tag === tag),
      { force: true },
    );
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** The user deleted a device: forget what was sent for it. */
  onDeviceDeleted(device) {
    const id = device?.external_id;
    if (typeof id !== 'string') {
      return;
    }
    this.transports.delete(id);
    for (const map of [this.published, this.publishedAt]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${id}:`)) {
          map.delete(key);
        }
      }
    }
  }

  // --- Reading Emoncms -----------------------------------------------------------

  /** Read Emoncms now (concurrent calls share the read), then publish. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  poll() {
    this.polling ??= this.read().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** @returns {Promise<boolean>} whether the widget should be refreshed */
  async read() {
    if (!this.readable()) {
      return false;
    }
    const client = this.client;
    let list;
    try {
      list = await client.feeds(this.config.readKey);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return client === this.client ? this.failed(err) : false;
    }
    if (client !== this.client) {
      return false; // reconfigured during the read
    }
    const wanted = this.config.feedIds;
    const feeds = parseFeeds(list).filter(
      (feed) => wanted.length === 0 || wanted.includes(feed.id),
    );
    let changed = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info(`Emoncms answers again (${feeds.length} feeds)`);
    } else if (this.readAt === 0) {
      logger.info(`Connected to Emoncms at ${hostOf(this.config.url)}: ${feeds.length} feeds`);
    }
    this.error = null;
    this.readAt = this.now();
    this.feeds = feeds;
    if (await this.compareStale()) {
      changed = true;
    }
    await this.sendStates(this.feeds);
    return changed;
  }

  /**
   * Fire the feeds that stopped or updated again since the last read. A feed
   * read for the first time only records its state.
   */
  async compareStale() {
    let changed = false;
    const present = new Set();
    for (const feed of this.feeds) {
      present.add(feed.id);
      const stale = this.isFeedStale(feed);
      const before = this.stale.get(feed.id);
      this.stale.set(feed.id, stale);
      if (before === undefined || before === stale) {
        continue;
      }
      changed = true;
      const status = stale ? FEED_STATUS.STOPPED : FEED_STATUS.RESUMED;
      logger.debug(`Feed ${feed.id} (${feed.name}) ${status}`);
      await this.fireEvent(TRIGGERS.FEED_STATUS, {
        device: deviceIds(this.gladys, feed.tag).device,
        status,
        feed_id: feed.id,
        feed_name: feed.name,
        device_name: feed.tag || UNTAGGED_NAME,
        status_label: pick(FEED_STATUS_TEXT[status], this.config.language),
        minutes: Math.round((this.now() - feed.time) / 60_000),
        value: feed.value,
      });
    }
    for (const id of [...this.stale.keys()]) {
      if (!present.has(id)) {
        this.stale.delete(id);
      }
    }
    return changed;
  }

  failed(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (wasError !== err.kind) {
      logger.warn(`Emoncms at ${hostOf(this.config.url)}: ${err.message}`);
    } else {
      logger.debug(`Emoncms at ${hostOf(this.config.url)}: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  async fireEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.issues.ok('scene', 'Scene events accepted again');
    } catch (err) {
      this.issues.fail('scene', 'warn', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------

  /** Send the values of `feeds` that are due: added, fresh, changed or heartbeat, within budget. */
  async sendStates(feeds, { force = false } = {}) {
    const created = this.createdTagIds();
    const now = this.now();
    const due = [];
    for (const feed of feeds) {
      if (!created.has(tagId(feed.tag)) || this.isFeedStale(feed)) {
        continue;
      }
      const value = gladysValue(feed);
      if (value === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, feed.tag).feature(featureKey(feed.id));
      const at = this.publishedAt.get(externalId);
      if (
        !force &&
        this.published.get(externalId) === value &&
        at !== undefined &&
        now - at < this.timings.heartbeatMs
      ) {
        continue;
      }
      due.push({ externalId, value, at: at ?? 0 });
    }
    this.sentTimes = this.sentTimes.filter((time) => now - time < 60_000);
    let states = due;
    if (!force) {
      const allowed = Math.max(0, this.timings.statesPerMinute - this.sentTimes.length);
      // The values waiting the longest first: every feed gets its turn.
      states = due.sort((a, b) => a.at - b.at).slice(0, allowed);
    }
    for (let at = 0; at < states.length; at += MAX_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_PER_REQUEST);
      try {
        await this.gladys.publishStates(
          batch.map(({ externalId, value }) => ({
            device_feature_external_id: externalId,
            state: value,
          })),
        );
        for (const { externalId, value } of batch) {
          this.published.set(externalId, value);
          this.publishedAt.set(externalId, now);
          this.sentTimes.push(now);
        }
        this.issues.ok('states', 'States accepted again');
      } catch (err) {
        this.issues.fail('states', 'warn', `States refused: ${err.message}`);
      }
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local or cloud, or unreachable. */
  async publishTransports() {
    if (this.readAt === 0 || !this.config) {
      return;
    }
    const transport = this.error
      ? DEVICE_TRANSPORTS.UNREACHABLE
      : this.config.cloud
        ? DEVICE_TRANSPORTS.CLOUD
        : DEVICE_TRANSPORTS.LOCAL;
    const created = this.createdTagIds();
    const entries = [];
    for (const tag of groupByTag(this.feeds).keys()) {
      const externalId = deviceIds(this.gladys, tag).device;
      if (created.has(tagId(tag)) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.issues.ok('transports', 'Transports accepted again');
      } catch (err) {
        this.issues.fail('transports', 'warn', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    const config = this.config;
    if (!config || (!config.url && !config.urlInvalid)) {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (config.urlInvalid) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!config.readKey) {
      return {
        connected: false,
        message: config.readKeyInvalid ? CONNECTION_TEXT.invalidKey : CONNECTION_TEXT.noKey,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.issues.ok('connection', 'Connection status accepted again');
    } catch (err) {
      this.issues.fail('connection', 'warn', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views (widget, report, scene action) -------------------------------------

  /** What the widget shows of a device: its feeds, freshness and age. */
  view(externalId) {
    const tag = this.tagOf(externalId);
    if (tag === null) {
      return null;
    }
    const ids = deviceIds(this.gladys, tag);
    return {
      name: tag || UNTAGGED_NAME,
      error: this.error?.kind ?? null,
      feeds: this.feeds
        .filter((feed) => feed.tag === tag)
        .map((feed) => ({
          feed,
          externalId: ids.feature(featureKey(feed.id)),
          stale: this.isFeedStale(feed),
          ageMs: feed.time === null ? null : this.now() - feed.time,
        })),
    };
  }

  /** "Test the connection": read Emoncms now, check the write key, one report. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    let write = 'noWrite';
    if (this.config.writeKey) {
      try {
        write = (await this.client.isWriteKey(this.config.writeKey)) ? 'writeOk' : 'writeRefused';
      } catch (err) {
        if (!err.kind) {
          throw err;
        }
        write = 'writeRefused';
      }
    } else if (this.config.writeKeyInvalid) {
      write = 'writeRefused';
    }
    logger.info(`Connection test: ${this.feeds.length} feeds, ${write}`);
    const stopped = this.feeds.filter((feed) => this.isFeedStale(feed)).length;
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      message[language] = labelled(
        hostOf(this.config.url),
        [
          text.ok,
          text.feeds(this.feeds.length),
          text.devices(groupByTag(this.feeds).size),
          ...(stopped ? [text.stopped(stopped)] : []),
          text[write],
        ].join(', '),
        language,
      );
    }
    return message;
  }

  /** Scene action: post one value to an input of Emoncms. */
  async postValue({ node, name, value }) {
    const language = this.config?.language;
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, language));
    }
    if (!this.config.writeKey) {
      throw new Error(pick(ACTION_TEXT.noWriteKey, language));
    }
    const nodeName = typeof node === 'string' ? node.trim() : '';
    const inputName = typeof name === 'string' ? name.trim() : '';
    if (!INPUT_NAME.test(nodeName) || !INPUT_NAME.test(inputName)) {
      throw new Error(pick(ACTION_TEXT.badName, language));
    }
    const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
    const number = Number(text.replace(',', '.'));
    if (text === '' || !Number.isFinite(number)) {
      throw new Error(pick(ACTION_TEXT.badValue, language));
    }
    try {
      await this.client.post(this.config.writeKey, nodeName, { [inputName]: number });
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      throw new Error(pick(ERROR_TEXT[err.kind], language), { cause: err });
    }
    logger.debug(`Sent ${nodeName}/${inputName} to Emoncms`);
    return { sent: true };
  }
}

export { ERROR_KINDS };
