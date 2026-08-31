/**
 * Split text into variable-length word groups to simulate SSE chunk boundaries.
 * Each token includes trailing whitespace so chunks reassemble with correct spacing.
 */
export function streamChunks(text: string): string[] {
  const tokens = text.match(/\S+\s*/g) || [];
  const chunks: string[] = [];
  const pattern = [2, 4, 3, 5, 2];
  let i = 0,
    pi = 0;
  while (i < tokens.length) {
    const size = Math.min(pattern[pi % pattern.length], tokens.length - i);
    chunks.push(tokens.slice(i, i + size).join(''));
    i += size;
    pi++;
  }
  return chunks;
}
