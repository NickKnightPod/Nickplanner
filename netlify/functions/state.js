// netlify/functions/state.js
// Loads/saves the whole task-tracker planner as one JSON blob in the
// Settings row of the "NK Active Task Tracker" Airtable base. Keeping the
// Airtable PAT server-side here (rather than in the browser, like the
// older NK Active apps) since this is Nick's own working data.
//
// Every request must carry a valid portal token whose taskTracker access
// is true — checked the same way verify-token.js checks it, just inline
// here so this function doesn't need an extra round trip.

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const BASE_ID = 'appxC0lTtgvX2j5kn'; // NK Active Task Tracker
const SETTINGS_TABLE = 'tblNv1vKwZMFOFNuA';
const SETTINGS_ROW_ID = 'reczUvCkmGHtTv7zk';
const FIELD_JSON = 'fldQpt6tTCg23hsO3'; // FullStateJSON

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', process.env.PORTAL_JWT_SECRET)
      .update(`${header}.${body}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function airtableRequest(path, options = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const { action, token, json } = body;

  const payload = token && verifyToken(token);
  if (!payload || !(payload.access && payload.access.taskTracker)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ ok: false, error: 'Not authorized' }) };
  }

  try {
    if (action === 'load') {
      const rec = await airtableRequest(`${SETTINGS_TABLE}/${SETTINGS_ROW_ID}?returnFieldsByFieldId=true`);
      const stored = rec.fields[FIELD_JSON] || '';
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, json: stored || null }) };
    }

    if (action === 'save') {
      if (typeof json !== 'string') {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'Missing json' }) };
      }
      await airtableRequest(SETTINGS_TABLE, {
        method: 'PATCH',
        body: JSON.stringify({ records: [{ id: SETTINGS_ROW_ID, fields: { [FIELD_JSON]: json } }] }),
      });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'Unknown action' }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
