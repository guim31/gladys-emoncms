# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Emoncms feeds in Gladys: one device per feed tag, one feature per feed, from
  an emonPi, a self-hosted server or emoncms.org, with the read API key.
- Units mapped to Gladys types: power, energy index (usable by the energy tab),
  voltage, current, temperature, volume, flow, pressure, light, pulses; a
  generic sensor with the unit in its name otherwise.
- Stopped feeds: their old value is never sent as fresh, and the scene trigger
  "Emoncms feed stopped or back" fires when a feed stops or updates again.
- Scene action "Send a value to Emoncms" (write API key).
- Dashboard widget "Emoncms feeds": overview, or a device with its stopped
  feeds.
- "Test the connection" action, feed filter, refresh interval from 5 seconds
  to 5 minutes, English, French, German and Spanish.
