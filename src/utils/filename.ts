export function safeStem(value: string): string {
  const result = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  if (!result) throw new Error('Enrollment cannot produce a safe filename.');
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(result) ? `_${result}` : result;
}
export function photoFilename(enrollment: string, name?: string) {
  return `${safeStem(enrollment)}${name ? '_' + safeStem(name) : ''}.jpg`;
}
