// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `feeds`.
//
// The use case: a glance tells whether the energy monitor still reports, and
// which feeds stopped (an emonTx out of batteries, a heat pump monitor
// unplugged), something the device tiles of Gladys never say.
//
//   - No device chosen: two tiles (feeds updating, feeds stopped), then one
//     row per device (Emoncms tag), orange when one of its feeds stopped.
//   - A device chosen: its first six feeds as live tiles (bound to the device
//     features, they follow the states without a refresh), then the stopped
//     feeds with the time since their last value.
//
// Budget (8 components, 6 tiles, 2 texts, 1 status): at most one text, six
// tiles and one status list of eight rows.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { UNTAGGED_NAME, groupByTag } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_KINDS } from './emoncms/client.js';
import { formatAge, labelled, pick } from './texts.js';

export const MAX_TILES = 6;
export const MAX_ROWS = 8;

export const TEXT = {
  noServer: {
    en: 'No Emoncms feed yet: enter the server address and the read key in the configuration.',
    fr: "Aucun flux Emoncms pour l'instant : saisissez l'adresse du serveur et la clé de lecture dans la configuration.",
    de: 'Noch kein Emoncms-Feed: Gib die Serveradresse und den Leseschlüssel in der Konfiguration ein.',
    es: 'Aún no hay ningún feed de Emoncms: introduzca la dirección del servidor y la clave de lectura en la configuración.',
  },
  gone: {
    en: 'No Emoncms feed has the tag of this device any more.',
    fr: "Plus aucun flux Emoncms ne porte l'étiquette de cet appareil.",
    de: 'Kein Emoncms-Feed trägt mehr das Tag dieses Geräts.',
    es: 'Ningún feed de Emoncms tiene ya la etiqueta de este dispositivo.',
  },
  updating: { en: 'Updating', fr: 'À jour', de: 'Aktuell', es: 'Activos' },
  stopped: { en: 'Stopped', fr: 'Arrêtés', de: 'Gestoppt', es: 'Detenidos' },
  allFresh: {
    en: 'Every feed updates',
    fr: 'Tous les flux sont à jour',
    de: 'Alle Feeds sind aktuell',
    es: 'Todos los feeds están activos',
  },
  feeds: { en: 'feeds', fr: 'flux', de: 'Feeds', es: 'feeds' },
  stoppedFor: { en: 'stopped', fr: 'arrêté', de: 'gestoppt', es: 'detenido' },
  noValue: { en: 'No value yet', fr: 'Aucune valeur', de: 'Noch kein Wert', es: 'Sin valor' },
  unreachable: {
    en: 'Emoncms unreachable',
    fr: 'Emoncms injoignable',
    de: 'Emoncms nicht erreichbar',
    es: 'Emoncms inaccesible',
  },
  refused: {
    en: 'API key refused',
    fr: "Clé d'API refusée",
    de: 'API-Schlüssel abgelehnt',
    es: 'Clave API rechazada',
  },
};

const text = (key, language) => pick(TEXT[key], language);

/** One row for a failing server: short enough for a status row (40). */
function errorRow(kind, language) {
  return {
    label: 'Emoncms',
    value: text(kind === ERROR_KINDS.AUTH ? 'refused' : 'unreachable', language),
    color: WIDGET_COLORS.DANGER,
  };
}

function overview(hub, language) {
  const groups = [...groupByTag(hub.feeds)];
  const stopped = hub.feeds.filter((feed) => hub.isFeedStale(feed)).length;
  const components = [
    {
      type: 'value',
      value: hub.feeds.length - stopped,
      label: text('updating', language),
      icon: 'activity',
      color: WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      value: stopped,
      label: text('stopped', language),
      icon: 'alert-triangle',
      color: stopped ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  const rows = hub.error ? [errorRow(hub.error.kind, language)] : [];
  for (const [tag, feeds] of groups.slice(0, MAX_ROWS - rows.length)) {
    const down = feeds.filter((feed) => hub.isFeedStale(feed)).length;
    rows.push({
      label: (tag || UNTAGGED_NAME).slice(0, 40),
      value: down
        ? `${down}/${feeds.length} ${text('stoppedFor', language)}`
        : `${feeds.length} ${text('feeds', language)}`,
      color: down ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    });
  }
  if (rows.length) {
    components.push({ type: 'status', items: rows });
  }
  return components;
}

function deviceContent(hub, view, language) {
  const components = view.feeds.slice(0, MAX_TILES).map(({ feed, externalId }) => ({
    type: 'value',
    label: (feed.name || `#${feed.id}`).slice(0, 24),
    device_feature: externalId,
  }));
  const rows = view.error ? [errorRow(view.error, language)] : [];
  for (const { feed, stale, ageMs } of view.feeds) {
    if (rows.length >= MAX_ROWS) {
      break;
    }
    if (feed.value === null) {
      rows.push({
        label: feed.name.slice(0, 40),
        value: text('noValue', language),
        color: WIDGET_COLORS.NEUTRAL,
      });
    } else if (stale) {
      rows.push({
        label: feed.name.slice(0, 40),
        value: labelled(text('stoppedFor', language), formatAge(ageMs, language), language),
        color: WIDGET_COLORS.WARNING,
      });
    }
  }
  if (rows.length === 0) {
    rows.push({
      label: view.name.slice(0, 40),
      value: text('allFresh', language),
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  components.push({ type: 'status', items: rows });
  return components;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(hub, { settings = {}, language = 'en' } = {}) {
      if (!hub.readable() || (hub.readAt === 0 && !hub.error)) {
        return {
          ttl_seconds: 60,
          components: [{ type: 'text', text: TEXT.noServer[language] ?? TEXT.noServer.en }],
        };
      }
      if (settings.device) {
        const view = hub.view(settings.device);
        if (!view) {
          return { ttl_seconds: 60, components: [{ type: 'text', text: text('gone', language) }] };
        }
        return { ttl_seconds: 60, components: deviceContent(hub, view, language) };
      }
      return { ttl_seconds: 60, components: overview(hub, language) };
    },
  },
};
