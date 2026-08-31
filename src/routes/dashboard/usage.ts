import { readFileSync } from 'fs';
import { projectPath } from '../../utils/paths.ts';
import { sidebarHtml } from './sidebar.ts';

const usageHtmlFile = projectPath('src', 'routes', 'dashboard', 'public', 'usage.html');

/** Usage page — served from public/usage.html with sidebar injected. */
export const usageHtml = readFileSync(usageHtmlFile, 'utf-8').replace('<!--SIDEBAR-->', sidebarHtml('usage'));
