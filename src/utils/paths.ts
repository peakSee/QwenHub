import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of this file (src/utils/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root is two levels up from src/utils/
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

/**
 * Resolve a path relative to the project root.
 * Use this instead of process.cwd() to ensure paths work
 * regardless of where the CLI is invoked from.
 */
export function projectPath(...segments: string[]): string {
  return resolve(PROJECT_ROOT, ...segments);
}
