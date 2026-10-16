// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene event
// variables and scene action errors. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './emoncms/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Emoncms server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Emoncms dans la configuration.",
    de: 'Gib die Adresse deines Emoncms-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Emoncms en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. 192.168.1.20/emoncms or https://emoncms.org',
    fr: 'Adresse incomprise, ex. 192.168.1.20/emoncms ou https://emoncms.org',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20/emoncms oder https://emoncms.org',
    es: 'Dirección no válida, p. ej. 192.168.1.20/emoncms o https://emoncms.org',
  },
  noKey: {
    en: 'Enter the read API key of your Emoncms account (My Account page).',
    fr: 'Saisissez la clé d’API de lecture de votre compte Emoncms (page My Account).',
    de: 'Gib den Lese-API-Schlüssel deines Emoncms-Kontos ein (Seite My Account).',
    es: 'Introduzca la clave API de lectura de su cuenta Emoncms (página My Account).',
  },
  invalidKey: {
    en: 'An Emoncms API key has 32 characters (0-9, a-f): check the copy.',
    fr: 'Une clé d’API Emoncms compte 32 caractères (0-9, a-f) : vérifiez la copie.',
    de: 'Ein Emoncms-API-Schlüssel hat 32 Zeichen (0-9, a-f): Prüfe die Kopie.',
    es: 'Una clave API de Emoncms tiene 32 caracteres (0-9, a-f): revise la copia.',
  },
};

// One short explanation per error kind of the client.
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Emoncms does not answer (is the server on?)',
    fr: 'Emoncms ne répond pas (le serveur est-il allumé ?)',
    de: 'Emoncms antwortet nicht (ist der Server an?)',
    es: 'Emoncms no responde (¿está encendido el servidor?)',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused by Emoncms',
    fr: "Clé d'API refusée par Emoncms",
    de: 'API-Schlüssel von Emoncms abgelehnt',
    es: 'Clave API rechazada por Emoncms',
  },
  [ERROR_KINDS.NOT_EMONCMS]: {
    en: 'No Emoncms API at this address (sub-path /emoncms?)',
    fr: "Pas d'API Emoncms à cette adresse (sous-chemin /emoncms ?)",
    de: 'Keine Emoncms-API unter dieser Adresse (Unterpfad /emoncms?)',
    es: 'No hay API de Emoncms en esta dirección (¿subruta /emoncms?)',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from Emoncms, see the logs',
    fr: "Réponse inattendue d'Emoncms, voir les logs",
    de: 'Unerwartete Antwort von Emoncms, sieh in den Protokollen nach',
    es: 'Respuesta inesperada de Emoncms, consulte los registros',
  },
};

// The state of a feed, in words (scene event variable).
export const FEED_STATUS_TEXT = {
  stopped: { en: 'Stopped', fr: 'Arrêté', de: 'Gestoppt', es: 'Detenido' },
  resumed: {
    en: 'Updating again',
    fr: 'De nouveau à jour',
    de: 'Wieder aktuell',
    es: 'Activo de nuevo',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    feeds: (count) => `${count} feed(s)`,
    devices: (count) => `${count} device(s) to add`,
    stopped: (count) => `${count} stopped`,
    writeOk: 'write key OK: sending is on',
    writeRefused: 'write key refused: check it',
    noWrite: 'no write key: sending is off',
  },
  fr: {
    ok: 'OK',
    feeds: (count) => `${count} flux`,
    devices: (count) => `${count} appareil(s) à ajouter`,
    stopped: (count) => `${count} arrêté(s)`,
    writeOk: "clé d'écriture valide : envoi actif",
    writeRefused: "clé d'écriture refusée : vérifiez-la",
    noWrite: "pas de clé d'écriture : envoi inactif",
  },
  de: {
    ok: 'OK',
    feeds: (count) => `${count} Feed(s)`,
    devices: (count) => `${count} Gerät(e) zum Hinzufügen`,
    stopped: (count) => `${count} gestoppt`,
    writeOk: 'Schreibschlüssel gültig: Senden aktiv',
    writeRefused: 'Schreibschlüssel abgelehnt: Prüfe ihn',
    noWrite: 'kein Schreibschlüssel: Senden inaktiv',
  },
  es: {
    ok: 'OK',
    feeds: (count) => `${count} feed(s)`,
    devices: (count) => `${count} dispositivo(s) para añadir`,
    stopped: (count) => `${count} detenido(s)`,
    writeOk: 'clave de escritura válida: envío activo',
    writeRefused: 'clave de escritura rechazada: revísela',
    noWrite: 'sin clave de escritura: envío inactivo',
  },
};

// Errors of the scene action (shown in the scene logs of Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Emoncms server is configured.',
    fr: "Aucun serveur Emoncms n'est configuré.",
    de: 'Kein Emoncms-Server ist konfiguriert.',
    es: 'No hay ningún servidor Emoncms configurado.',
  },
  noWriteKey: {
    en: 'Enter the write API key in the configuration to send values.',
    fr: "Saisissez la clé d'API d'écriture dans la configuration pour envoyer des valeurs.",
    de: 'Gib den Schreib-API-Schlüssel in der Konfiguration ein, um Werte zu senden.',
    es: 'Introduzca la clave API de escritura en la configuración para enviar valores.',
  },
  badName: {
    en: 'Node and input names: letters, digits, spaces, - _ . (64 characters at most).',
    fr: "Noms de nœud et d'entrée : lettres, chiffres, espaces, - _ . (64 caractères au plus).",
    de: 'Knoten- und Eingangsnamen: Buchstaben, Ziffern, Leerzeichen, - _ . (höchstens 64 Zeichen).',
    es: 'Nombres de nodo y de entrada: letras, cifras, espacios, - _ . (64 caracteres como máximo).',
  },
  badValue: {
    en: 'The value to send is not a number.',
    fr: "La valeur à envoyer n'est pas un nombre.",
    de: 'Der zu sendende Wert ist keine Zahl.',
    es: 'El valor que se va a enviar no es un número.',
  },
};

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A number written the way the language writes it (decimal comma in fr, de, es). */
export const formatNumber = (value, language, digits = 1) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

/** A duration since a date, "12 min", "3 h", "2 d" ("j" in French, "T" in German). */
export function formatAge(ms, language) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} ${language === 'de' ? 'Std.' : 'h'}`;
  }
  const day = { en: 'd', fr: 'j', de: 'T', es: 'd' }[language] ?? 'd';
  return `${Math.round(hours / 24)} ${day}`;
}
