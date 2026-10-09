// Glob matching with bounded dynamic programming, not user-supplied regular expressions.
export function matchesGroupName(name, pattern) {
  const value = Array.from(String(name).normalize('NFC').toLowerCase());
  const glob = Array.from(String(pattern).normalize('NFC').toLowerCase());
  let previous = Array(value.length + 1).fill(false);
  previous[0] = true;
  for (const char of glob) {
    const next = Array(value.length + 1).fill(false);
    next[0] = char === '*' && previous[0];
    for (let index = 1; index <= value.length; index++)
      next[index] =
        char === '*'
          ? previous[index] || next[index - 1]
          : previous[index - 1] && (char === '?' || char === value[index - 1]);
    previous = next;
  }
  return previous[value.length];
}
