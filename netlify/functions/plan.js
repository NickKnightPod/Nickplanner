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

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  const prompt = 'You are an experienced operations consultant helping the owner of a small UK podiatry/healthcare business (NK Active) break a quarterly EOS "Rock" (a goal/project) into a concrete, well-thought-out project plan he can schedule directly into his calendar.\n\n' +
    'Rock: "' + title + '"\n' +
    (owner ? 'Owner: ' + owner + '\n' : '') +
    (notes ? 'Notes/status: ' + notes + '\n' : '') +
    (due ? 'Due date: ' + due + '\n' : '') +
    '\nThink like someone who actually has to do this work, not like someone writing generic project-management boilerplate. Before answering, reason through what this specific Rock genuinely requires — the real sub-tasks, decisions, dependencies, people to involve, and things that could go wrong — given it\'s a small healthcare/podiatry business context unless the Rock is clearly about something else.\n\n' +
    'Then produce 6-10 sections of work that:\n' +
    '- Are SPECIFIC to this Rock, not generic phase names. Bad: "Research options". Good: "Compare 3 orthoses lab suppliers on turnaround time and cost per unit".\n' +
    '- Cover the full lifecycle: initial groundwork/research, key decisions, the core build/delivery work (usually the largest chunk, split into multiple sections if it\'s substantial), any compliance/clinical/supplier steps relevant to healthcare, testing or trialling with real patients/staff where relevant, and rollout/communication at the end.\n' +
    '- Are sequential and realistic — each one should be something he could actually sit down and do in one admin-day sitting.\n' +
    '- Have a realistic hour estimate each (whole or half hours only — 1, 1.5, 2, 3, 4, up to about 6; split anything bigger into multiple sections).\n\n' +
    'Reply with ONLY the list, one section per line, in EXACTLY this format and nothing else — no headers, no numbering, no extra commentary, no markdown:\n' +
    'Section title | hours\n\n' +
    'Example of the expected LEVEL OF SPECIFICITY (do not reuse this example\'s content — it\'s just showing the bar):\n' +
    'Shortlist 3 orthoses suppliers and request sample pricing | 1.5\n' +
    'Order and clinically trial samples with 2 regular patients | 2\n' +
    'Review trial feedback and pick final supplier | 1\n' +
    'Agree pricing tiers and update patient price list | 1.5\n' +
    'Brief front-desk staff on the new offering and booking process | 1\n' +
    'Update website/booking system with the new service | 2\n' +
    'Soft-launch to existing patient list via email | 1\n' +
    'Review uptake after 2 weeks and adjust | 1';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1200,
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
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter(function (b) { return b && b.type === 'text' && typeof b.text === 'string'; })
      .map(function (b) { return b.text; }).join('\n').trim();
    if (!text) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Claude returned no usable text (stop reason: ' + (data.stop_reason || 'unknown') + '). Try again, or shorten the Rock\'s notes.'
        })
      };
    }
    return { statusCode: 200, body: JSON.stringify({ plan: text }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
