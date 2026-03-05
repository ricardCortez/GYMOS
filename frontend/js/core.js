// GymOS - core.js: globals, config, API helpers
'use strict';

// ── API URL dinámica ─────────────────────────────────────────
const API = window.location.origin + '/api';

// ── Config del gimnasio (se sobrescribe desde /api/settings) ─
let CFG = { currency: 'S/', gymName: 'GymOS', faceThreshold: 0.45, checkinCooldown: 3600 };

// ── Estado de sesión ─────────────────────────────────────────
let AUTH_TOKEN   = null;
let CURRENT_USER = null;

// ── Wizard de registro ───────────────────────────────────────
let REG = { step: 0, memberId: null, planId: null };

// ── Caché local de datos ─────────────────────────────────────
let MEMBERS      = [];
let PLANS        = [];
let MS_LIST      = [];
let PAYS         = [];
let ANNS         = [];
let AUDIO_FILES  = [];
let PROMOTIONS   = [];
let PROMO_TIMERS = {};

// ── Constantes ───────────────────────────────────────────────
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Inject auth token into all /api/ requests ────────────────
const _originalFetch = window.fetch.bind(window);
window.fetch = function(url, opts = {}) {
  if (AUTH_TOKEN && typeof url === 'string' && url.includes('/api/')) {
    opts.headers = { ...(opts.headers||{}), 'Authorization': 'Bearer ' + AUTH_TOKEN };
  }
  return _originalFetch(url, opts);
};

// ── API helpers ──────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  return r.json();
}

const GET  = p       => api(p);
const POST = (p, b)  => api(p, { method: 'POST',   body: b });
const PUT  = (p, b)  => api(p, { method: 'PUT',    body: b });
const DEL  = p       => api(p, { method: 'DELETE' });
let synth   = window.speechSynthesis;
let voices  = [];
let _bestVoice = null;