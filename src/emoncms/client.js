// -----------------------------------------------------------------------------
// HTTP client of the Emoncms API, the same on an emonPi, a self-hosted server
// and emoncms.org. The API key travels in an `Authorization: Bearer` header
// (Emoncms 9+), never in the URL: an address with a key never reaches a log.
//
//   GET  /feed/list.json?meta=1        every feed: id, tag, name, unit, value,
//                                      time, and its interval (one request a cycle)
//   GET  /user/get.json                answers the user only with the write key
//   GET  /input/post?node=…&fulljson=… one value to an input (write key)
//
// Answers recorded on Emoncms 11.9.10: test/fixtures/emoncms/.
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  AUTH: 'auth',
  NOT_EMONCMS: 'not_emoncms',
  HTTP: 'http',
});

const TIMEOUT_MS = 10_000;

export class EmoncmsError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** The default HTTP seam: fetch, with a timeout. The tests pass a fake one. */
export async function fetchRequest(url, { headers = {}, timeoutMs = TIMEOUT_MS } = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, body: await response.text() };
}

export class EmoncmsClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL (src/config.js parseServerUrl)
   * @param {Function} [options.request] HTTP seam: (url, { headers }) => { status, body }
   */
  constructor({ url, request = fetchRequest }) {
    this.url = url;
    this.request = request;
  }

  async get(path, key) {
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      });
    } catch (err) {
      // The cause carries the useful part (ECONNREFUSED, ENOTFOUND, timeout).
      const reason = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? 'error';
      throw new EmoncmsError(ERROR_KINDS.UNREACHABLE, `no answer (${reason})`);
    }
    const { status, body } = response;
    if (status === 401 || status === 403 || /^\s*Invalid API key/i.test(body)) {
      throw new EmoncmsError(ERROR_KINDS.AUTH, `API key refused (HTTP ${status})`);
    }
    if (status === 404 || status === 406) {
      throw new EmoncmsError(ERROR_KINDS.NOT_EMONCMS, `no Emoncms API here (HTTP ${status})`);
    }
    if (status < 200 || status >= 300) {
      throw new EmoncmsError(ERROR_KINDS.HTTP, `HTTP ${status}`);
    }
    return body;
  }

  async getJson(path, key) {
    const body = await this.get(path, key);
    try {
      return JSON.parse(body);
    } catch {
      // An HTML page: a login page, another web server, a wrong sub-path.
      throw new EmoncmsError(ERROR_KINDS.NOT_EMONCMS, 'the answer is not JSON');
    }
  }

  /** Every feed of the account, with its last value and its interval. */
  async feeds(key) {
    const list = await this.getJson('/feed/list.json?meta=1', key);
    // Emoncms answers `false` to a request it does not authenticate.
    if (list === false) {
      throw new EmoncmsError(ERROR_KINDS.AUTH, 'API key refused');
    }
    if (!Array.isArray(list)) {
      throw new EmoncmsError(ERROR_KINDS.NOT_EMONCMS, 'unexpected feed list');
    }
    return list;
  }

  /** True when `key` is the write key of the account (the user is only told to it). */
  async isWriteKey(key) {
    const user = await this.getJson('/user/get.json', key);
    return Boolean(user && typeof user === 'object' && user.id !== undefined);
  }

  /** Post values to the inputs of a node, as an emonTx would. */
  async post(key, node, values) {
    const query = `node=${encodeURIComponent(node)}&fulljson=${encodeURIComponent(JSON.stringify(values))}`;
    const body = await this.get(`/input/post?${query}`, key);
    // A read key gets an empty 200: only `{"success": true}` means written.
    let answer = null;
    try {
      answer = JSON.parse(body);
    } catch {
      // handled below
    }
    if (answer?.success !== true) {
      throw new EmoncmsError(
        ERROR_KINDS.AUTH,
        `values refused${answer?.message ? ` (${answer.message})` : ''}`,
      );
    }
  }
}
