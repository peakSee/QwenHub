/**
 * Smart compression for tool results before they reach the LLM.
 * Prevents echo at the source by compressing structured tool output
 * into a form the model can analyze but cannot verbatim-repeat.
 */

export function truncateToolResult(content: string, maxBytes: number = 4096): string {
  if (!content) return '';
  const encoded = new TextEncoder().encode(content);
  if (encoded.length <= maxBytes) return content;

  const headBytes = Math.floor(maxBytes * 0.45);
  const tailBytes = Math.floor(maxBytes * 0.45);

  const headView = new Uint8Array(encoded.buffer, 0, headBytes);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(headView);
  const tailStart = encoded.length - tailBytes;
  const tailView = new Uint8Array(encoded.buffer, tailStart, tailBytes);
  const tail = new TextDecoder('utf-8', { fatal: false }).decode(tailView);

  return `${head}\n... [truncated ${content.length - headBytes - tailBytes} chars] ...\n${tail}`;
}

function compressGitDiff(content: string, lines: string[], totalLines: number): string | null {
  if (!content.includes('diff --git') && !content.includes('--- a/')) return null;
  const diffHeaders: string[] = [];
  let totalHunks = 0;
  let totalChangedLines = 0;
  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@ ')) {
      diffHeaders.push(line);
      if (line.startsWith('@@ ')) totalHunks++;
    }
    if (line.startsWith('+') || line.startsWith('-')) totalChangedLines++;
  }
  if (diffHeaders.length === 0) return null;
  return `<compressed diff>\nFiles changed annotations (${diffHeaders.filter((l) => l.startsWith('diff')).length} files, ${totalHunks} hunks, ${totalChangedLines} lines changed):\n\n${diffHeaders.join('\n')}\n\n[Content compressed — ${totalLines} lines reduced to ${diffHeaders.length + 5} lines summary]\n</compressed diff>`;
}

function compressJson(content: string, trimmed: string): string | null {
  if (!((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}')))) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (parsed === null) return null;
  if (Array.isArray(parsed)) {
    const len = parsed.length;
    if (len <= 5) return trimmed;
    const head = parsed.slice(0, 2);
    const tail = parsed.slice(-2);
    const omitted = len - 6;
    const sample = `${JSON.stringify(head, null, 2)}\n... [${omitted} more items omitted — ${len} total] ...\n${JSON.stringify(tail, null, 2)}`;
    return sample.length < content.length * 0.7
      ? sample
      : `${JSON.stringify(head, null, 2)}\n... [${omitted} more items omitted — ${len} total] ...\n${JSON.stringify(tail, null, 2)}`;
  }
  if (trimmed.length < 3000) return trimmed;
  return null;
}

function compressFileListing(content: string, lines: string[], totalLines: number): string | null {
  const linePattern = lines[0]?.match(/^([\w./-]+):\d+/);
  if (!linePattern && !lines.every((l) => l.startsWith('./') || l.startsWith('/'))) return null;
  const uniqueDirs = new Set(lines.map((l) => l.substring(0, l.lastIndexOf('/') + 1)).filter(Boolean));
  const summary = `<compressed listing>\n${totalLines} entries across ${uniqueDirs.size} directories\nSample (first 10):\n${lines.slice(0, 10).join('\n')}\n${totalLines > 10 ? `\n... [${totalLines - 10} more entries omitted] ...` : ''}\n</compressed listing>`;
  return summary.length < content.length * 0.7 ? summary : null;
}

function compressCargoTest(content: string, lines: string[], totalLines: number): string | null {
  if (!content.includes('test ') || !(lines.some((l) => /^test\s+\S+.*\s(ok|FAILED)\s/.test(l)) || content.includes('test result:')))
    return null;
  let passed = 0;
  let failed = 0;
  const failureContext: string[] = [];
  let inFailure = false;
  let failCountdown = 0;
  for (const line of lines) {
    const testMatch = line.match(/^test\s+(\S+).*\s(ok|FAILED)\s/);
    if (testMatch) {
      if (testMatch[2] === 'ok') passed++;
      else {
        failed++;
        failureContext.push(line);
        inFailure = true;
        failCountdown = 15;
      }
    } else if (inFailure && failCountdown > 0) {
      failureContext.push(line);
      failCountdown--;
      if (failCountdown === 0) inFailure = false;
    }
  }
  const resultLine = lines.find((l) => l.includes('test result:'));
  const body = `${resultLine || `cargo test: ${passed} passed, ${failed} failed`}${failed > 0 ? `\n\nFailure details:\n${failureContext.join('\n')}` : ''}`;
  const compressed = `<compressed cargo test>\n${body}\n[${totalLines} lines → ${(body.match(/\n/g) || []).length + 4} lines]\n</compressed cargo test>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressPytest(content: string, lines: string[], totalLines: number): string | null {
  if (!lines.some((l) => /(PASSED|FAILED|ERROR)\s*$/.test(l.trim()))) return null;
  let passed = 0,
    failed = 0,
    errors = 0;
  const failureContext: string[] = [];
  let inFailure = false,
    failCountdown = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/PASSED\s*$/.test(t) && !t.includes('==')) passed++;
    else if (/FAILED\s*$/.test(t) && !t.includes('==')) {
      failed++;
      failureContext.push(line);
      inFailure = true;
      failCountdown = 20;
    } else if (/ERROR\s*$/.test(t) && !t.includes('==')) {
      errors++;
      failureContext.push(line);
      inFailure = true;
      failCountdown = 20;
    } else if (inFailure && failCountdown > 0) {
      failureContext.push(line);
      failCountdown--;
      if (failCountdown === 0) inFailure = false;
    }
  }
  if (passed + failed + errors === 0) return null;
  const body = `pytest: ${passed} passed, ${failed} failed${errors > 0 ? `, ${errors} errors` : ''}${failureContext.length > 0 ? `\n\nFailures:\n${failureContext.join('\n')}` : ''}`;
  const compressed = `<compressed pytest>\n${body}\n[${totalLines} lines → ${(body.match(/\n/g) || []).length + 4} lines]\n</compressed pytest>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressDocker(content: string, lines: string[], totalLines: number): string | null {
  if (totalLines <= 3 || !(lines.some((l) => /^CONTAINER\s+ID\s/.test(l)) || lines.some((l) => /^REPOSITORY\s+TAG\s/.test(l)))) return null;
  const h = lines[0];
  const sampleRows = lines.slice(1, 4).filter((l) => l.trim());
  const dataRows = lines.slice(1).filter((l) => l.trim()).length;
  const remaining = dataRows - sampleRows.length;
  const body = `${h}\n${sampleRows.length > 0 ? sampleRows.join('\n') : '(empty)'}${remaining > 0 ? `\n\n... [${remaining} more rows omitted — ${dataRows} total entries] ...` : ''}`;
  const compressed = `<compressed docker>\n${body}\n[${totalLines} lines → ${(body.match(/\n/g) || []).length + 4} lines]\n</compressed docker>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressNpm(content: string, lines: string[], totalLines: number): string | null {
  if (!(lines.some((l) => /npm (ERR|WARN)/.test(l)) || lines.some((l) => /^\s*\+?\s*[\w.-]+@/.test(l) && l.includes('added')))) return null;
  const npmErrors = lines.filter((l) => /npm ERR/i.test(l));
  const warnings = [...new Set(lines.filter((l) => /npm WARN/i.test(l)))];
  const summaryLines = lines.filter((l) => /^\s*(up to date|packages are looking|\d+ packages are|\d+ vulnerabilities?)/i.test(l));
  const auditLines = lines.filter((l) => /^\s*(added|removed|changed|found|\d+)/i.test(l) && /\b(audit|package|vulnerabilit)/i.test(l));
  const parts: string[] = [];
  if (auditLines.length > 0) parts.push(auditLines.join('\n'));
  if (summaryLines.length > 0) parts.push(summaryLines.join('\n'));
  if (warnings.length > 0) parts.push(`Warnings (${warnings.length} unique):\n${warnings.join('\n')}`);
  if (npmErrors.length > 0) parts.push(`Errors:\n${npmErrors.join('\n')}`);
  const body = parts.join('\n');
  const compressed = `<compressed npm>\n${body}\n[${totalLines} lines → ${(body.match(/\n/g) || []).length + 4} lines]\n</compressed npm>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressGitLog(content: string, lines: string[], totalLines: number): string | null {
  if (!lines.some((l) => /^[0-9a-f]{7,40}\s{2,}/.test(l)) || totalLines <= 5) return null;
  const entries: string[] = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{7,40})\s+(.*)/);
    if (match) entries.push(`${match[1].substring(0, 7)} ${match[2].trim() || '(no message)'}`);
  }
  if (entries.length === 0) return null;
  const compressed = `<compressed git log>\n${entries.join('\n')}\n[${totalLines} lines → ${entries.length} commits]\n</compressed git log>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressGitStatus(content: string, lines: string[], totalLines: number): string | null {
  if (!/(Changes not staged for commit|Untracked files|Changes to be committed)/.test(content)) return null;
  const sections: { name: string; files: string[] }[] = [];
  let cur: { name: string; files: string[] } | null = null;
  for (const line of lines) {
    const headerMatch = line.match(/^#?\s*(Changes (not staged for commit|to be committed)|Untracked files):/);
    if (headerMatch) {
      cur = { name: headerMatch[1], files: [] };
      sections.push(cur);
    } else if (cur && /^\s+\S/.test(line) && line.trim()) cur.files.push(line.trim());
  }
  if (sections.length === 0) return null;
  const parts = sections.map((s) => `${s.name}: ${s.files.length} files`);
  const compressed = `<compressed git status>\n${parts.join('\n')}\n[${totalLines} lines → ${sections.length + 4} lines]\n</compressed git status>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressGitPush(content: string, lines: string[], totalLines: number): string | null {
  if (!lines.some((l) => l.includes('->')) || !lines.some((l) => /^\s*To\s/.test(l))) return null;
  const refLines = lines.filter((l) => l.includes('->') && !l.includes('* ') && !l.includes('Already'));
  const compressed = `<compressed git push>\nPushed ${refLines.length} ref(s):\n${refLines.join('\n')}\n[${totalLines} lines → ${refLines.length + 4} lines]\n</compressed git push>`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

function compressLongContent(content: string, lines: string[], totalLines: number, trimmed: string): string | null {
  if (totalLines <= 50 || trimmed.startsWith('[') || trimmed.startsWith('{')) return null;
  const first20 = lines.slice(0, 20);
  const last10 = lines.slice(-10);
  const omitted = totalLines - 30;
  const compressed = `${first20.join('\n')}\n... [${omitted} lines omitted] ...\n${last10.join('\n')}`;
  return compressed.length < content.length * 0.7 ? compressed : null;
}

/**
 * Smart compression for tool results before they reach the LLM.
 * Prevents echo at the source by compressing structured tool output
 * into a form the model can analyze but cannot verbatim-repeat.
 */
export function compressToolResult(content: string): string {
  if (!content || content.length < 500) return content;

  const lines = content.split('\n');
  const totalLines = lines.length;
  const trimmed = content.trim();

  return (
    compressGitDiff(content, lines, totalLines) ??
    compressJson(content, trimmed) ??
    compressFileListing(content, lines, totalLines) ??
    compressCargoTest(content, lines, totalLines) ??
    compressPytest(content, lines, totalLines) ??
    compressDocker(content, lines, totalLines) ??
    compressNpm(content, lines, totalLines) ??
    compressGitLog(content, lines, totalLines) ??
    compressGitStatus(content, lines, totalLines) ??
    compressGitPush(content, lines, totalLines) ??
    compressLongContent(content, lines, totalLines, trimmed) ??
    truncateToolResult(content)
  );
}
