// Browser-side event tracker for the PGRKAM Insight candidate portal.
// Usage:  import { track } from '../tracking';   track('job_view', { job_id: 12 });
//
// Rules:
//  - Never put personal data (name, email, phone) in properties.
//  - The login token is read from localStorage under the key "pgrkam_token".
//    The portal's login code must save it there. The server uses it to attach user_id.

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5001').replace(/\/+$/, '');

const TOKEN_KEY = 'pgrkam_token';
const ANON_KEY = 'pgrkam_anon_id';
const SESSION_KEY = 'pgrkam_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // a session ends after 30 min of inactivity
const DEDUPE_MS = 1000; // ignore an identical event sent again within 1 second

// ---------- Safe storage (works even if the browser blocks storage) ----------
let memoryAnonId = null;
let memorySession = null;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode): we fall back to memory
  }
}

// ---------- Ids ----------
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return [
    h.slice(0, 4).join(''),
    h.slice(4, 6).join(''),
    h.slice(6, 8).join(''),
    h.slice(8, 10).join(''),
    h.slice(10).join(''),
  ].join('-');
}

function getAnonymousId() {
  let id = read(ANON_KEY) || memoryAnonId;
  if (!id) {
    id = uuid();
    write(ANON_KEY, id);
  }
  memoryAnonId = id;
  return id;
}

// ---------- Device ----------
function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet';
  }
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

// ---------- Traffic source (decided once per session) ----------
function clean(value, max) {
  return value ? String(value).trim().slice(0, max) : null;
}

function detectSource() {
  const params = new URLSearchParams(window.location.search);
  const campaign = clean(params.get('utm_campaign'), 100);

  const utmSource = clean(params.get('utm_source'), 100);
  if (utmSource) return { source: utmSource, campaign };

  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      // A click from our own site is not a new source
      if (host && host !== window.location.hostname) return { source: host, campaign };
    }
  } catch {
    // Bad referrer value: ignore it
  }
  return { source: 'direct', campaign };
}

// ---------- Session ----------
function readSession() {
  const raw = read(SESSION_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt value: start a new session
    }
  }
  return memorySession;
}

function getSession() {
  const now = Date.now();
  let session = readSession();
  let isNew = false;

  if (!session || !session.id || now - session.last > SESSION_TIMEOUT_MS) {
    session = { id: uuid(), last: now, ...detectSource() };
    isNew = true;
  }

  session.last = now;
  memorySession = session;
  write(SESSION_KEY, JSON.stringify(session));
  return { session, isNew };
}

// ---------- Sending ----------
function buildEvent(eventName, properties, session) {
  return {
    event_id: uuid(),
    event_name: eventName,
    session_id: session.id,
    anonymous_id: getAnonymousId(),
    event_time: new Date().toISOString(),
    source: session.source,
    campaign: session.campaign,
    device: detectDevice(),
    properties,
  };
}

function send(payload) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = read(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true, // lets the request finish even if the page is closing
    }).catch(() => {});
  } catch {
    // Tracking must never break the app
  }
}

// ---------- Public function ----------
const recent = new Map();

export function track(eventName, properties = {}) {
  try {
    const props = { path: window.location.pathname, ...properties };

    // Skip an identical event fired again within 1 second (React dev mode runs effects twice)
    const key = eventName + JSON.stringify(props);
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    if (recent.size > 50) recent.clear();

    const { session, isNew } = getSession();

    // The first event of a new session is preceded by a session_start
    if (isNew && eventName !== 'session_start') {
      send(buildEvent('session_start', { path: props.path }, session));
    }
    send(buildEvent(eventName, props, session));
  } catch {
    // Tracking must never break the app
  }
}