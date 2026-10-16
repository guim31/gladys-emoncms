// -----------------------------------------------------------------------------
// Emoncms feeds -> Gladys devices, proposed in the Discovery tab: one device
// per feed tag (in practice a node: emonpi, emontx4, heatpump…), one feature
// per feed. The user adds the devices to follow, nothing is created on their
// behalf.
//
// Identity: the tag (verbatim when it is a plain word, hashed otherwise) and
// the feed id, the id Emoncms keeps for the life of a feed. A feed moved to
// another tag becomes a feature of another device, under another external id.
//
// Units: the feed unit decides the category/type couple (test/gladys-rules.test.js
// holds them to the core table). The cumulative energy feeds (kWh, Wh) are
// `energy-sensor/index`, the couple the energy tab of Gladys 5.2 turns into
// consumption and cost. A unit Gladys has no type for (Hz, kWh/d, a free text)
// gives a generic sensor whose name carries the unit: nothing is invented.
//
// Published with should_poll: false: the integration reads Emoncms on its own
// timer (src/hub.js), one request per cycle for every feed.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'tag';
export const MODEL = 'Emoncms';

// The device of the feeds without a tag.
export const UNTAGGED_NAME = 'Emoncms';

/** The feature key of a feed: permanent once published. */
export const featureKey = (feedId) => `feed_${feedId}`;

/** The platform id of a tag: the tag itself when it is a plain word. */
export function tagId(tag) {
  if (/^[a-z0-9_-]{1,40}$/.test(tag)) {
    return tag;
  }
  return `_${createHash('sha1').update(tag).digest('hex').slice(0, 12)}`;
}

/** External ids of the device of a tag. */
export const deviceIds = (gladys, tag) => gladys.externalIds(DEVICE_TYPE, tagId(tag));

/** The tag id of a device external id, null when not ours. */
export function parseDeviceId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^(?:[a-z0-9_-]{1,40}|_[0-9a-f]{12})$/.test(id) ? id : null;
}

// Display bounds (the core never applies them on write). Signed values get
// symmetric bounds: a CT clamp reads negative power when the grid is exported to.
const BIG = 1e12;

const kind = (category, type, unit, min, max, digits, extra = {}) => ({
  definition: { category, type, ...(unit ? { unit } : {}), min, max },
  digits,
  ...extra,
});

const power = (unit, max, digits) =>
  kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.POWER, unit, -max, max, digits);
const index = (unit, digits) =>
  kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.INDEX, unit, 0, BIG, digits);
const temperature = (unit, min, max) =>
  kind(CATEGORY.TEMPERATURE_SENSOR, TYPE.SENSOR.DECIMAL, unit, min, max, 1);
const pressure = (unit, max, digits) =>
  kind(CATEGORY.PRESSURE_SENSOR, TYPE.SENSOR.DECIMAL, unit, 0, max, digits);
const volume = (unit, digits) =>
  kind(CATEGORY.VOLUME_SENSOR, TYPE.SENSOR.DECIMAL, unit, 0, BIG, digits);
const generic = (unit, min, max, digits) =>
  kind(CATEGORY.UNKNOWN, TYPE.UNKNOWN.UNKNOWN, unit, min, max, digits);

/**
 * The Gladys shape of each Emoncms unit, keyed by the unit as typed in
 * Emoncms (lower case, spaces removed). `scale` converts the value.
 */
const UNITS = {
  w: power(UNIT.WATT, 1_000_000, 1),
  kw: power(UNIT.KILOWATT, 1000, 3),
  kwh: index(UNIT.KILOWATT_HOUR, 3),
  wh: index(UNIT.WATT_HOUR, 1),
  mwh: index(UNIT.MEGAWATT_HOUR, 6),
  v: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.VOLTAGE, UNIT.VOLT, 0, 1000, 1),
  a: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.CURRENT, UNIT.AMPERE, 0, 1000, 2),
  ma: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.CURRENT, UNIT.MILLI_AMPERE, 0, 1e6, 0),
  // Apparent and reactive power: no Gladys type, but Gladys has the units.
  va: generic(UNIT.VOLT_AMPERE, -1_000_000, 1_000_000, 1),
  kva: generic(UNIT.KILOVOLT_AMPERE, -1000, 1000, 3),
  var: generic(UNIT.VOLT_AMPERE_REACTIVE, -1_000_000, 1_000_000, 1),
  '°c': temperature(UNIT.CELSIUS, -60, 200),
  c: temperature(UNIT.CELSIUS, -60, 200),
  degc: temperature(UNIT.CELSIUS, -60, 200),
  '°f': temperature(UNIT.FAHRENHEIT, -76, 392),
  k: temperature(UNIT.KELVIN, 0, 500),
  '%': generic(UNIT.PERCENT, 0, 100, 1),
  l: volume(UNIT.LITER, 2),
  'm³': volume(UNIT.CUBIC_METER, 3),
  m3: volume(UNIT.CUBIC_METER, 3),
  // A flow (heat pump circuit, water meter): Gladys has m³/h only.
  'm³/h': kind(CATEGORY.WATER_VALVE, TYPE.WATER_VALVE.FLOW, UNIT.CUBIC_METER_PER_HOUR, 0, 1000, 3),
  'm3/h': kind(CATEGORY.WATER_VALVE, TYPE.WATER_VALVE.FLOW, UNIT.CUBIC_METER_PER_HOUR, 0, 1000, 3),
  'l/min': kind(
    CATEGORY.WATER_VALVE,
    TYPE.WATER_VALVE.FLOW,
    UNIT.CUBIC_METER_PER_HOUR,
    0,
    1000,
    3,
    { scale: 0.06 },
  ),
  'l/h': kind(CATEGORY.WATER_VALVE, TYPE.WATER_VALVE.FLOW, UNIT.CUBIC_METER_PER_HOUR, 0, 1000, 3, {
    scale: 0.001,
  }),
  pa: pressure(UNIT.PASCAL, 200_000, 0),
  hpa: pressure(UNIT.HECTO_PASCAL, 2000, 1),
  mbar: pressure(UNIT.MILLIBAR, 2000, 1),
  kpa: pressure(UNIT.KILO_PASCAL, 2000, 2),
  bar: pressure(UNIT.BAR, 100, 2),
  lux: kind(CATEGORY.LIGHT_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.LUX, 0, 200_000, 0),
  ppm: generic(UNIT.PPM, 0, 1_000_000, 0),
  db: generic(UNIT.DECIBEL, -200, 200, 1),
  pulses: kind(CATEGORY.COUNTER_SENSOR, TYPE.SENSOR.INTEGER, undefined, 0, BIG, 0),
};

/** The Emoncms units with a Gladys shape (as keyed: lower case, no space). */
export const KNOWN_UNITS = Object.freeze(Object.keys(UNITS));

// A feed without a unit, or with a unit Gladys has no type for.
const UNKNOWN = generic(undefined, -BIG, BIG, 3);

/** The key of an Emoncms unit in UNITS. */
const unitKey = (unit) => (typeof unit === 'string' ? unit.replace(/\s+/g, '').toLowerCase() : '');

/** The Gladys shape of a feed, from its unit. */
export function shapeOf(unit) {
  const shape = UNITS[unitKey(unit)];
  if (shape) {
    return { ...shape, known: true };
  }
  return { ...UNKNOWN, known: false };
}

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** The value of a feed as published in Gladys (unit converted, rounded), null when none. */
export function gladysValue(feed) {
  if (feed.value === null) {
    return null;
  }
  const shape = shapeOf(feed.unit);
  return round(feed.value * (shape.scale ?? 1), shape.digits);
}

/** The name of a feed feature: the feed name, with its unit when Gladys cannot show it. */
function featureName(feed) {
  const shape = shapeOf(feed.unit);
  const unit = typeof feed.unit === 'string' ? feed.unit.trim() : '';
  const name = feed.name || `Feed ${feed.id}`;
  return (!shape.known && unit ? `${name} (${unit})` : name).slice(0, 80);
}

/** The feeds grouped by tag, in the order of the feed list. */
export function groupByTag(feeds) {
  const groups = new Map();
  for (const feed of feeds) {
    if (!groups.has(feed.tag)) {
      groups.set(feed.tag, []);
    }
    groups.get(feed.tag).push(feed);
  }
  return groups;
}

/** The features of a tag, with names made distinct on the device. */
export function featuresOf(gladys, tag, feeds) {
  const ids = deviceIds(gladys, tag);
  const taken = new Set();
  return feeds.map((feed) => {
    let name = featureName(feed);
    if (taken.has(name)) {
      name = `${name} #${feed.id}`.slice(0, 90);
    }
    taken.add(name);
    return {
      name,
      external_id: ids.feature(featureKey(feed.id)),
      ...shapeOf(feed.unit).definition,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    };
  });
}

/**
 * The discovery payload of the device of a tag.
 * @param {object} gladys SDK client
 * @param {string} tag the Emoncms tag ('' for the feeds without one)
 * @param {Array<object>} feeds its feeds (src/emoncms/model.js)
 */
export function buildDevice(gladys, tag, feeds) {
  return {
    name: (tag || UNTAGGED_NAME).slice(0, 255),
    external_id: deviceIds(gladys, tag).device,
    model: MODEL,
    should_poll: false,
    features: featuresOf(gladys, tag, feeds),
  };
}
