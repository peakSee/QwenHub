import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'config.json');

const DEFAULTS = {
  PORT: '26405',
  HOST: '',
  API_KEY: '',
  BROWSER: 'chromium',
  TOOL_CALLING: 'true',
  CLEAN_OUTPUT: 'true',
  STREAMING_MODE: 'auto',
  MAX_TOOL_CALLS_PER_RESPONSE: '3',
  QWEN_FETCH_TIMEOUT_MS: '30000',
  AUTH_TOKEN_MAX_AGE_MS: '28800000',
  AUTH_REFRESH_BEFORE_MS: '300000',
  DELETE_SESSION: 'true',
  RATE_LIMIT_COOLDOWN_MS: '120000',
  MAX_LOGS: '50',
  CUSTOM_INSTRUCTION: '',
  USE_CUSTOM_INSTRUCTION: 'false',
  SAVE_REQUEST_LOGS: 'false',
  RETRY_MAX_ATTEMPTS: '3',
  OPEN_DASHBOARD_ON_START: 'false',
  RETRY_BASE_DELAY_MS: '1000',
  RETRY_MAX_DELAY_MS: '30000',
  RETRY_BACKOFF_MULTIPLIER: '2',
  RETRY_ENABLED: 'true',
  CLAUDE_CODE_PROXY: 'false',
};

/**
 * Strip JSONC comments (// line comments and /* block comments *\/) so the result
 * is valid JSON that JSON.parse can handle.
 */
function stripJsonc(raw) {
  // Remove block comments first, then line comments
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => {
      const idx = l.indexOf('//');
      return idx === -1 ? l : l.slice(0, idx);
    })
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1'); // trailing commas
}

async function ask(query, def) {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${query} [${def}]: `, (answer) => {
      rl.close();
      resolve(answer.trim() || def);
    });
  });
}

async function main() {
  // Skip interactive prompts when piped (e.g. curl | bash)
  const useDefaults = !process.stdin.isTTY;

  // Read existing config, tolerating JSONC (// comments) from config.example.jsonc
  let config = {};
  let configExisted = false;
  if (existsSync(CONFIG_PATH)) {
    configExisted = true;
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    try {
      config = JSON.parse(stripJsonc(raw));
    } catch {
      // config was corrupted (e.g. JSONC copied as .json) — will recreate with defaults
    }
  }

  // If running non-interactively and config already exists, do nothing
  if (useDefaults && configExisted && Object.keys(config).length > 0) {
    return;
  }

  if (useDefaults) {
    console.log('  Non-interactive install — using defaults. Edit config.json later.\n');
  }

  // Lazily import readline only when interactive
  let port = DEFAULTS.PORT;
  let apiKey = DEFAULTS.API_KEY;
  let browser = DEFAULTS.BROWSER;
  let toolCalling = DEFAULTS.TOOL_CALLING;
  let cleanOutput = DEFAULTS.CLEAN_OUTPUT;

  if (useDefaults) {
    port = config.PORT || DEFAULTS.PORT;
    apiKey = config.API_KEY || DEFAULTS.API_KEY;
    browser = config.BROWSER || DEFAULTS.BROWSER;
    toolCalling = config.TOOL_CALLING || DEFAULTS.TOOL_CALLING;
    cleanOutput = config.CLEAN_OUTPUT || DEFAULTS.CLEAN_OUTPUT;
  } else {
    port = await ask('Server port', config.PORT || DEFAULTS.PORT);
    apiKey = await ask('API key (leave empty for no auth)', config.API_KEY || DEFAULTS.API_KEY);
    browser = await ask('Browser engine (chromium/firefox/chrome/edge)', config.BROWSER || DEFAULTS.BROWSER);
    toolCalling = await ask('Enable tool calling (true/false)', config.TOOL_CALLING || DEFAULTS.TOOL_CALLING);
    cleanOutput = await ask('Clean output (strip XML tags) (true/false)', config.CLEAN_OUTPUT || DEFAULTS.CLEAN_OUTPUT);
  }

  const newConfig = Object.assign({}, DEFAULTS, config, {
    PORT: port,
    API_KEY: apiKey,
    BROWSER: browser,
    TOOL_CALLING: toolCalling,
    CLEAN_OUTPUT: cleanOutput,
  });

  writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2) + '\n');
  if (!useDefaults) console.log(`\n  ✅ Config saved to ${CONFIG_PATH}`);
  console.log('\n  Run `bun start` (preferred) or `npm start` to launch Qwen Gate.\n');
}

main().catch((e) => {
  // Fail silently in non-interactive mode (postinstall, qg auto-install)
  if (process.stdin.isTTY) {
    console.error('Setup failed:', e.message);
    process.exit(1);
  }
});
