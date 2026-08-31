import { getBxUaToken } from '../src/services/bxUaGenerator.ts';

const token = getBxUaToken();
const baseHeaders: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142',
  'origin': 'https://chat.qwen.ai',
  'referer': 'https://chat.qwen.ai/',
  'content-type': 'application/json',
};

async function test() {
  const chatUrl = 'https://chat.qwen.ai/api/v2/chat/completions';
  const body = JSON.stringify({
    model: 'qwen-turbo-latest',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
  });

  // Test 1: WITH bx-ua
  console.log('=== WITH bx-ua ===');
  try {
    const resp = await fetch(chatUrl, {
      method: 'POST',
      headers: { ...baseHeaders, 'bx-ua': token },
      body,
    });
    console.log(`Status: ${resp.status}`);
    const text = await resp.text();
    console.log(`Body: ${text.slice(0, 500)}`);
    if (resp.status === 401) console.log('→ 401 (needs auth) — bx-ua OK, WAF passed');
    else if ([302, 403].includes(resp.status)) console.log('→ WAF blocked — bx-ua rejected');
    else if (resp.ok) console.log('→ 200 — fully working!');
  } catch (e: any) { console.log(`Error: ${e.message}`); }

  // Test 2: WITHOUT bx-ua
  console.log('\n=== WITHOUT bx-ua ===');
  try {
    const resp2 = await fetch(chatUrl, {
      method: 'POST',
      headers: baseHeaders,
      body,
    });
    console.log(`Status: ${resp2.status}`);
    const text2 = await resp2.text();
    console.log(`Body: ${text2.slice(0, 500)}`);
    if (resp2.status === 401) console.log('→ 401 (needs auth) — same as with bx-ua');
    else if ([302, 403].includes(resp2.status)) console.log('→ WAF blocked without bx-ua!');
  } catch (e: any) { console.log(`Error: ${e.message}`); }
}

test();
