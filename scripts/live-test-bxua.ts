/**
 * Live test: bx-ua token vs real Qwen API.
 */
import { getBxUaToken } from '../src/services/bxUaGenerator.ts';

const token = getBxUaToken();
console.log(`Token: ${token.slice(0, 30)}...${token.slice(-10)} (${token.length} chars)`);

const headers: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142',
  'origin': 'https://chat.qwen.ai',
  'referer': 'https://chat.qwen.ai/',
  'content-type': 'application/json',
  'bx-ua': token,
};

async function test() {
  const url = 'https://chat.qwen.ai/api/v2/models';
  
  // Test 1: WITH bx-ua
  console.log('\n=== WITH bx-ua ===');
  try {
    const resp = await fetch(url, { method: 'GET', headers });
    console.log(`Status: ${resp.status}`);
    const text = await resp.text();
    console.log(`Body: ${text.slice(0, 400)}`);
    if (resp.status === 401) console.log('✓ 401 (needs auth) — bx-ua accepted');
    else if ([302, 403].includes(resp.status)) console.log('✗ WAF reject — bx-ua invalid');
    else if (resp.ok) console.log('✓ 200 — token works!');
  } catch (e: any) { console.log(`Error: ${e.message}`); }
  
  // Test 2: WITHOUT bx-ua
  console.log('\n=== WITHOUT bx-ua ===');
  const h2 = { ...headers };
  delete h2['bx-ua'];
  try {
    const resp2 = await fetch(url, { method: 'GET', headers: h2 });
    console.log(`Status: ${resp2.status}`);
    const text2 = await resp2.text();
    console.log(`Body: ${text2.slice(0, 400)}`);
  } catch (e: any) { console.log(`Error: ${e.message}`); }
}

test();
