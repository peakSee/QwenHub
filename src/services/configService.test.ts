import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ConfigService, DEFAULT_CONFIG } from './configService.ts';
import { logStore } from './logStore.ts';

function tmpFile(prefix: string): string {
  return resolve(tmpdir(), `qwen-config-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
}

// Track env vars we modify so we can restore them
const savedEnv: Record<string, string | undefined> = {};
function saveEnv(key: string) {
  savedEnv[key] = process.env[key];
}
function restoreEnv(key: string) {
  if (savedEnv[key] === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = savedEnv[key];
  }
  delete savedEnv[key];
}

test('load - creates config.json with defaults when missing', () => {
  const path = tmpFile('create');
  // Ensure file does not exist
  try {
    unlinkSync(path);
  } catch {
    /* ok */
  }
  assert.equal(existsSync(path), false, 'test file should not exist before test');

  const svc = new ConfigService(path);
  assert.equal(existsSync(path), true, 'config.json should have been created');
  const written = JSON.parse(readFileSync(path, 'utf-8'));
  assert.equal(written.PORT, DEFAULT_CONFIG.PORT);
  assert.equal(written.API_KEY, DEFAULT_CONFIG.API_KEY);
  assert.equal(written.API_KEY, DEFAULT_CONFIG.API_KEY);

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('get - returns process.env value (env wins)', () => {
  const path = tmpFile('env-wins');
  // Write config with different PORT
  writeFileSync(path, JSON.stringify({ PORT: '11111' }), 'utf-8');
  const svc = new ConfigService(path);

  saveEnv('PORT');
  process.env.PORT = '99999';
  const val = svc.get('PORT');
  assert.equal(val, '99999');
  restoreEnv('PORT');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('get - returns JSON value when no env set', () => {
  const path = tmpFile('json-val');
  writeFileSync(path, JSON.stringify({ PORT: '12345' }), 'utf-8');
  const svc = new ConfigService(path);

  saveEnv('PORT');
  delete process.env.PORT;
  const val = svc.get('PORT');
  assert.equal(val, '12345');
  restoreEnv('PORT');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('get - returns default when neither JSON nor env set', () => {
  const path = tmpFile('use-default');
  // Empty JSON file — no keys set
  writeFileSync(path, JSON.stringify({}), 'utf-8');
  const svc = new ConfigService(path);

  saveEnv('PORT');
  delete process.env.PORT;
  const val = svc.get('PORT');
  assert.equal(val, DEFAULT_CONFIG.PORT);
  restoreEnv('PORT');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('get - returns default when config missing key and no env', () => {
  const path = tmpFile('missing-key');
  writeFileSync(path, JSON.stringify({ SOME_OTHER_KEY: 'x' }), 'utf-8');
  const svc = new ConfigService(path);

  saveEnv('PORT');
  delete process.env.PORT;
  assert.equal(svc.get('PORT'), DEFAULT_CONFIG.PORT);
  restoreEnv('PORT');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('set - updates in-memory value', () => {
  const path = tmpFile('set-test');
  writeFileSync(path, JSON.stringify({}), 'utf-8');
  const svc = new ConfigService(path);

  svc.set('PORT', '55555');
  assert.equal(svc.get('PORT'), '55555');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('save - writes to config.json', () => {
  const path = tmpFile('save-test');
  writeFileSync(path, JSON.stringify({}), 'utf-8');
  const svc = new ConfigService(path);

  svc.set('MODELS_CACHE_TTL_MS', '99999');
  svc.set('PORT', '77777');
  svc.save();

  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.MODELS_CACHE_TTL_MS, '99999');
  assert.equal(parsed.PORT, '77777');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('getAll - returns all keys', () => {
  const path = tmpFile('getall');
  // Use keys unlikely to be set as CI env vars to avoid false failures
  writeFileSync(path, JSON.stringify({ MODELS_CACHE_TTL_MS: '99999', MAX_LOGS: '99' }), 'utf-8');
  const svc = new ConfigService(path);

  const all = svc.getAll();
  const keys = Object.keys(all);
  assert.ok(keys.length > 0, 'should return keys');
  assert.ok(keys.includes('MODELS_CACHE_TTL_MS'), 'should include MODELS_CACHE_TTL_MS');
  assert.ok(keys.includes('MAX_LOGS'), 'should include MAX_LOGS');
  // get() and getAll() check process.env first — these assertions are valid
  // only if MODELS_CACHE_TTL_MS and MAX_LOGS aren't set in the test environment
  assert.equal(all.MODELS_CACHE_TTL_MS, '99999');
  assert.equal(all.MAX_LOGS, '99');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('reset - reloads from disk', () => {
  const path = tmpFile('reset-test');
  writeFileSync(path, JSON.stringify({ PORT: 'initial' }), 'utf-8');
  const svc = new ConfigService(path);

  // Change in-memory
  svc.set('PORT', 'modified');
  assert.equal(svc.get('PORT'), 'modified');

  // Write different value to disk
  writeFileSync(path, JSON.stringify({ PORT: 'disk-value' }), 'utf-8');

  // Reset should reload from disk
  svc.reset();
  assert.equal(svc.get('PORT'), 'disk-value');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('config.json with bad JSON - uses defaults', () => {
  const path = tmpFile('bad-json');
  writeFileSync(path, '{ bad json !!! }', 'utf-8');
  const svc = new ConfigService(path);

  saveEnv('PORT');
  delete process.env.PORT;
  assert.equal(svc.get('PORT'), DEFAULT_CONFIG.PORT);
  restoreEnv('PORT');

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('validate - warns on negative PORT values', () => {
  const path = tmpFile('neg-port');
  writeFileSync(path, JSON.stringify({ PORT: '-1' }), 'utf-8');
  const svc = new ConfigService(path);

  const warnings: string[] = [];
  const origLog = logStore.log.bind(logStore);
  logStore.log = (_level: string, _category: string, msg: string) => {
    warnings.push(msg);
  };
  try {
    svc.validate();
    assert.ok(warnings.some((w) => w.includes('PORT') && w.includes('invalid')));
  } finally {
    logStore.log = origLog;
  }

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});

test('load - warns on unknown config keys', () => {
  const path = tmpFile('unknown-keys');
  writeFileSync(path, JSON.stringify({ PORT: '26405', FOOBAR: 'baz' }), 'utf-8');

  const warnings: string[] = [];
  const origLog = logStore.log.bind(logStore);
  logStore.log = (_level: string, _category: string, msg: string) => {
    warnings.push(msg);
  };
  try {
    new ConfigService(path);
    assert.ok(warnings.some((w) => w.includes('Unknown key') && w.includes('FOOBAR')));
  } finally {
    logStore.log = origLog;
  }

  try {
    unlinkSync(path);
  } catch {
    /* cleanup */
  }
});
