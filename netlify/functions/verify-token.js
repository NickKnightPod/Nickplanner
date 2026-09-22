// netlify/functions/verify-token.js
// Verifies a token issued by the NK Active Portal's login function.
// Requires the PORTAL_JWT_SECRET env var to be set to the SAME value as
// on the portal site — that shared secret is what lets this app trust a
// token without ever talking to the portal's Airtable base directly.

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function verify(token) {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.PORTAL_JWT_SECRET)
    .update(`${header}.${body}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (expected !== sig) return null;
  const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  if (!body.token) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'Missing token' }) };
  }

  const payload = verify(body.token);
  if (!payload) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false }) };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, name: payload.name, role: payload.role, access: payload.access }),
  };
};
