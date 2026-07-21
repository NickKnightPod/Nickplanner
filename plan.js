// Serverless proxy for the "Ask Claude" button in the EOS Planner's
// "Map out the plan" modal. Runs on Netlify's servers, not in the browser —
// this is the only safe place to hold an API key, since anything shipped to
// the browser in a static site is publicly visible to anyone who looks.
//
// Setup (one-time, in the Netlify dashboard — this file alone isn't enough):
//   Site settings -> Environment variables -> add ANTHROPIC_API_KEY
//   (get a key at https://console.anthropic.com/settings/keys)
// Optionally also set ANTHROPIC_MODEL to override the default model below.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'ANTHROPIC_API_KEY is not set on this Netlify site. Add it under Site settings -> Environment variables, then redeploy.'
      })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const title = (payload.title || '').slice(0, 500);
  const notes = (payload.notes || '').slice(0, 1000);
  const due = payload.due || '';
  const owner = payload.owner || '';

  if (!title.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing Rock title' }) };
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

  const prompt = `You are helping a small business owner break a quarterly EOS "Rock" (a goal/project) into a short, practical list of timed work sections he can schedule into his calendar.

Rock: "${title}"
${owner ? `Owner: ${owner}\n` : ''}${notes ? `Notes/status: ${notes}\n` : ''}${due ? `Due date: ${due}\n` : ''}

Break this into 4-8 concrete, sequential sections of work. For each, estimate realistic hours (use numbers like 1, 1.5, 2, 3, 4 — whole or half hours only, each section under about 6 hours; split bigger chunks of work into multiple sections instead).

Reply with ONLY the list, one section per line, in EXACTLY this format and nothing else — no headers, no numbering, no extra commentary:
Section title | hours

Example of the expected format:
Draft initial requirements | 2
Get stakeholder sign-off | 1
Build first version | 4
Test and gather feedback | 2
Roll out and communicate | 1.5`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || 'Anthropic API error' })
      };
    }
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    return { statusCode: 200, body: JSON.stringify({ plan: text.trim() }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
