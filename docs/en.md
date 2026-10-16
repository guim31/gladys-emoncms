# Emoncms

[Emoncms](https://emoncms.org/) is the open-source energy monitoring software
of [OpenEnergyMonitor](https://openenergymonitor.org/): it records the feeds of
an emonPi, an emonTx, an emonHP heat pump monitor or any sensor that posts to
it, on a local server or on emoncms.org. This integration brings these feeds
into Gladys: one device per feed tag (in practice one per node: `emonpi`,
`emontx4`, `heatpump`…), one feature per feed, with the right Gladys type for
its unit. The cumulative energy feeds (kWh) can be used by the energy tab of
Gladys. A scene can react when a feed stops updating, send values from Gladys
to Emoncms, and a dashboard widget shows which feeds are still alive.

Tested against a real Emoncms 11.9.10 server (Docker), with inputs posted
through its API and turned into power, energy, voltage, temperature and flow
feeds. Developed without the hardware (no emonPi or emonTx at hand): feedback
welcome on [the issues](https://github.com/guim31/gladys-emoncms/issues).
emoncms.org uses the same API but was not tested (no account).

## What you need

- Gladys Assistant 5.1.0 or later.
- An Emoncms server reachable from the Gladys machine: an emonPi or emonBase on
  your network, your own server, or an account on emoncms.org.
- The **read API key** of the Emoncms account (page **My Account** of Emoncms).
  The **write API key** only if you want to send values from Gladys to Emoncms.

The integration only reads, unless you use the scene action "Send a value to
Emoncms": then it only posts to the inputs you name.

## Getting started

### 1. Find the address and the keys

Open Emoncms in a browser and note the address: `http://192.168.1.20`,
`http://emonpi.local/emoncms` (some servers serve Emoncms under `/emoncms`), or
`https://emoncms.org`. You can paste the address of any Emoncms page: the
integration keeps the root. Then open **My Account**: the read and write API
keys are 32 characters long.

### 2. Configure the integration

In Gladys, open the integration's configuration page:

- **Emoncms address**: the address noted above.
- **Read API key**: enough to read every feed.
- **Write API key (optional)**: only for the scene action that sends values.
- **Feeds to follow**: the ids of the feeds to bring into Gladys (column Id of
  the Feeds page), separated by commas. Empty: every feed.
- **Refresh interval**: from 5 seconds to 5 minutes, 10 seconds by default.
  Each refresh is a single request for every feed.
- **Feed stopped after**: a feed without a new value for this long counts as
  stopped (15 minutes by default, "Never" to turn the check off).
- **Language of the messages**: language of the scene variables and of the
  errors.

Then click **Test the connection**: it reads Emoncms and tells the number of
feeds, of devices to add, of stopped feeds, and whether the write key works.

### 3. Add the devices

Open the **Discover** tab of the integration: there is one device per feed tag
(the feeds without a tag are grouped in a device named "Emoncms"). Add the ones
you want. A new feed shows the device as updated: click **Update** to add it. A
renamed feed keeps its first name in Gladys (feature names are fixed at
creation).

## The devices

Each feed becomes a feature named after the feed, typed by its unit:

| Emoncms unit                   | In Gladys                                      |
| ------------------------------ | ---------------------------------------------- |
| W, kW                          | Power (signed: a negative power is an export)  |
| kWh, Wh, MWh                   | Energy index, used by the energy tab of Gladys |
| V, A, mA                       | Voltage, current                               |
| °C, °F, K                      | Temperature                                    |
| L, m³                          | Volume                                         |
| L/min, L/h, m³/h               | Water flow, in m³/h (12.5 L/min = 0.75 m³/h)   |
| hPa, mbar, Pa, kPa, bar        | Pressure                                       |
| lux                            | Light                                          |
| pulses                         | Counter                                        |
| VA, kVA, var, %, ppm, dB       | Generic sensor, with its unit                  |
| none, Hz, kWh/d, anything else | Generic sensor, the unit in its name           |

Only the cumulative energy feeds (kWh, Wh, MWh) become an energy index: a kWh
feed made by Emoncms' "Power to kWh" process is one. A "kWh/d" feed stays a
generic sensor.

Values are sent to Gladys when they change. The last value of a **stopped**
feed is not sent again as if it were fresh: its history in Gladys stops where
the feed stopped. With **Feed stopped after** set to "Never", there is no such
check: the last value of a dead feed is sent again every 6 hours. The device badge shows "local" (or "cloud" for emoncms.org),
and "unreachable" while Emoncms does not answer.

## Dashboard

The **Emoncms feeds** widget has a setting, **Device (empty: overview)**:

- empty, it shows the number of feeds updating and stopped, then one row per
  device, orange when one of its feeds stopped;
- with a device, it shows its first six feeds as live tiles, then the stopped
  feeds with the time since their last value.

## Scenes

### Triggers

**Emoncms feed stopped or back**: a feed got no new value for the delay set in
**Feed stopped after**, or updates again. Filters: the device, and the change
(Stopped, Updating again). Variables: the feed, its id, the device (tag), the
state, the minutes since the last value and the last value. Nothing fires at
the start of the integration, only on a change seen while it runs.

### Actions

**Send a value to Emoncms**: posts a number to an input of Emoncms, as an emonTx
would, with the write key. Fields: **Node** (`gladys` by default), **Input
name**, **Value**. The value can be a scene variable, for example a value read
by the "Get device value" action just before. In Emoncms, the input appears in
the Inputs page: log it to a feed to keep its history. Output: **Sent**.

### Scene ideas

- **emonTx out of order**: trigger "Emoncms feed stopped or back", change
  "Stopped", device `emontx` → send a message "Emoncms: {{feed_name}} stopped
  {{minutes}} min ago".
- **Keep a Zigbee sensor in Emoncms**: trigger on the temperature of a Gladys
  sensor, action "Get device value", then "Send a value to Emoncms" with node
  `gladys`, input `living_room` and the value read.
- **Heat pump power**: with the heat pump power feed added, a scene can turn a
  water heater off when the power goes above a threshold (a device trigger of
  Gladys, nothing specific to the integration).

## Troubleshooting

- **"Emoncms does not answer"**: check the address in a browser from a machine
  on the same network as Gladys. An emonPi may be at `http://emonpi.local`, but
  the container of the integration does not resolve `.local` names: prefer the
  IP address.
- **"No Emoncms API at this address"**: the address opens another web page.
  Add or remove the `/emoncms` sub-path.
- **"API key refused"**: copy the read API key again from My Account. A write
  key also reads, but is not needed.
- **A feed shows as stopped while it updates**: the clocks of Gladys and of the
  Emoncms server differ, or the feed is recorded less often than the delay. Set
  **Feed stopped after** higher.
- **A new feed is missing**: check **Feeds to follow**, then **Update** the
  device in the Discover tab.

## Limits

- One Emoncms account per installation of the integration.
- The feed ids and tags identify the features: a feed moved to another tag
  becomes a new feature of another device, without the old history.
- The inputs of Emoncms are not read: only the feeds. The history already in
  Emoncms is not imported into Gladys.
- Gladys cannot send device states automatically to Emoncms: a scene with the
  "Send a value to Emoncms" action does it, one value at a time.
- emoncms.org: same API, not tested; follow its usage rules (a refresh every
  10 seconds or slower is plenty).
