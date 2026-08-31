import { readFileSync } from 'node:fs';
import { projectPath } from './paths.ts';

const pkg = JSON.parse(readFileSync(projectPath('package.json'), 'utf-8'));
export const APP_VERSION: string = pkg.version;
