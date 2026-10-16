# Emoncms for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com/) integration for
[Emoncms](https://emoncms.org/), the open-source energy monitoring software of
[OpenEnergyMonitor](https://openenergymonitor.org/) (emonPi, emonTx, emonHP heat
pump monitor, self-hosted server or emoncms.org).

> Developed without the hardware: feedback welcome. Tested against a real
> Emoncms 11.9.10 server in Docker; emoncms.org uses the same API but was not
> tested (no account).

## Features

- **One device per feed tag** (in practice one per node: `emonpi`, `emontx4`,
  `heatpump`…), one feature per feed, proposed in the Discover tab.
- **Units mapped to Gladys types**: W and kW → power (signed), kWh/Wh/MWh →
  energy index (the energy tab of Gladys 5.2 computes consumption and cost
  from it), V, A, °C/°F/K, L and m³, L/min → m³/h flow, pressure, lux, pulses.
  A unit Gladys has no type for (Hz, kWh/d, free text) gives a generic sensor
  whose name carries the unit: nothing is invented.
- **Stopped feeds**: a feed without a new value for a configurable delay is
  never presented as fresh (its value is not sent again), and fires a scene
  trigger; so does its return.
- **Scene action "Send a value to Emoncms"**: posts a number to an Emoncms
  input (write key), the scene-driven equivalent of Home Assistant's
  `emoncms_history`.
- **Dashboard widget "Emoncms feeds"**: an overview of the feeds updating and
  stopped per device, or the live values of one device and its stopped feeds.
- **Light on the server**: one request per refresh (10 s by default, 5 s to
  5 min) for every feed; only the changes are published to Gladys.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- An Emoncms server reachable from Gladys (local network or emoncms.org), and
  the read API key of the account (page My Account). The write API key only for
  the scene action.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-emoncms`.
2. In the **Configuration** tab, enter the address of Emoncms and the read API
   key, then **Test the connection**.
3. Add the devices from the **Discover** tab.

The user documentation is in [`docs/`](docs/en.md) (English, French, German,
Spanish).

## How it works

At each refresh, one `GET /feed/list.json?meta=1` returns every feed of the
account with its last value, its time and its interval. The API key travels in
an `Authorization: Bearer` header, never in the URL. Devices are keyed on the
feed tag, features on the feed id. Gladys does not poll the devices
(`should_poll: false`): the container reads Emoncms on its own timer.

Only the devices added to Gladys receive states, only when a value changes
(rounded), within 240 states a minute, with a heartbeat every 6 hours while the
feed updates. A feed counts as stopped when its last value is older than the
configured delay (15 minutes by default) and three of its intervals.

## Checked on a real Emoncms, and what was not

Tested against a real Emoncms 11.9.10 (the all-in-one image `alexjunk/emoncms`
from the emoncms-docker project), with inputs posted through the input API and
turned into power, cumulative energy (Power to kWh), voltage, temperature,
flow and frequency feeds. The recorded feed list is kept in
`test/fixtures/emoncms/`. The image of the integration was run within the
Gladys sandbox constraints (read-only, no capability, 256 MB) against it:
discovery, units, polling, a restart of Emoncms, a refused key, and the input
post.

Not checked: emoncms.org (same API, no account), an emonPi or emonTx (the
feeds were posted by hand), Emoncms versions older than 11, and an actual
Gladys instance (the tests use the fake Gladys of the SDK).

## Limitations

- One Emoncms account per installation; the feeds, not the inputs.
- The history already in Emoncms is not imported.
- Gladys does not let an integration read the states of other devices: sending
  values to Emoncms goes through a scene, one value at a time.
- `.local` names are not resolved in the container: use the IP address of an
  emonPi.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Emoncms (`test/helpers/fakeEmoncms.js`) serving the real
answers of `test/fixtures/emoncms/`. See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

## Credits

- [Emoncms](https://github.com/emoncms/emoncms) and
  [OpenEnergyMonitor](https://openenergymonitor.org/) (AGPL-3.0): only their
  HTTP API is used, no code is copied.
- The Home Assistant [`emoncms`](https://www.home-assistant.io/integrations/emoncms/)
  and `emoncms_history` integrations (Apache-2.0) inspired the scope: sensors
  per feed, values sent to inputs.
- [alexjunk/emoncms](https://hub.docker.com/r/alexjunk/emoncms), the
  all-in-one Emoncms image used for the tests.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by OpenEnergyMonitor
or Megni.

## License

Apache-2.0
