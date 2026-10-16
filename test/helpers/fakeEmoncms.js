// -----------------------------------------------------------------------------
// A fake Emoncms server behind the HTTP seam of the client, answering what
// Emoncms 11.9.10 answered (test/fixtures/emoncms/): the feed list with
// meta=1, `Invalid API key` in a 401, `false` without a key, the user to the
// write key only, an empty 200 to an input post made with the read key.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const READ_KEY = '0123456789abcdef0123456789abcdef';
export const WRITE_KEY = 'fedcba9876543210fedcba9876543210';
export const BASE_URL = 'http://192.0.2.10/emoncms';

export const FEED_LIST = JSON.parse(
  readFileSync(new URL('../fixtures/emoncms/feed-list-meta.json', import.meta.url), 'utf8'),
);

// The fixture was recorded at this time (seconds): every feed fresh.
export const RECORDED_AT = Math.max(...FEED_LIST.map((feed) => feed.time));

export class FakeEmoncms {
  constructor({ feeds = structuredClone(FEED_LIST), url = BASE_URL } = {}) {
    this.url = url;
    this.feeds = feeds;
    /** null, 'down', 'html', 'http500' */
    this.failure = null;
    this.requests = [];
    this.posts = [];
  }

  /** Set the value of a feed, written at `time` (seconds). */
  set(id, value, time) {
    const feed = this.feeds.find((f) => Number(f.id) === id);
    feed.value = value;
    if (time !== undefined) {
      feed.time = time;
    }
  }

  /** Move every feed time to `time` (seconds): they all updated then. */
  touchAll(time) {
    for (const feed of this.feeds) {
      feed.time = time;
    }
  }

  request = async (url, { headers = {} } = {}) => {
    this.requests.push(url);
    if (this.failure === 'down' || !url.startsWith(this.url)) {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ECONNREFUSED' };
      throw err;
    }
    if (this.failure === 'html') {
      return { status: 200, body: '<!doctype html><html></html>' };
    }
    if (this.failure === 'http500') {
      return { status: 500, body: 'Internal Server Error' };
    }
    const key = (headers.authorization ?? '').replace(/^Bearer /, '');
    const path = url.slice(this.url.length);
    if (key && key !== READ_KEY && key !== WRITE_KEY) {
      return { status: 401, body: 'Invalid API key' };
    }
    if (path.startsWith('/feed/list.json')) {
      return { status: 200, body: key ? JSON.stringify(this.feeds) : 'false' };
    }
    if (path.startsWith('/user/get.json')) {
      return {
        status: 200,
        body: key === WRITE_KEY ? JSON.stringify({ id: '1', username: 'demo' }) : 'false',
      };
    }
    if (path.startsWith('/input/post')) {
      if (key !== WRITE_KEY) {
        return { status: 200, body: '' };
      }
      const query = new URLSearchParams(path.split('?')[1]);
      this.posts.push({ node: query.get('node'), values: JSON.parse(query.get('fulljson')) });
      return { status: 200, body: '{"success": true}' };
    }
    return {
      status: 406,
      body: '{"success":false,"message":"406 Not Acceptable. Route not found"}',
    };
  };
}
