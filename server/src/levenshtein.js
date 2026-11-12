/**
 * Classic Wagner–Fischer distance. Used only for short guesses, so the
 * O(n*m) table is cheap.
 */
export function levenshtein(a, b) {
  const left = String(a);
  const right = String(b);
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const prev = new Array(right.length + 1);
  const curr = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    const leftChar = left.charCodeAt(i - 1);
    for (let j = 1; j <= right.length; j += 1) {
      const cost = leftChar === right.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
}
