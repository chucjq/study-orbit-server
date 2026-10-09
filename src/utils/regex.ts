/** Escapes regex metacharacters so user input can be used as a literal search term. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
