// Rust String::len measures UTF-8 bytes in both post office contracts.
export const POSTBOX_NAME_LIMIT = 80;
export function postboxNameError(name: string): string | undefined {
  if (!name.trim()) return "Choose a postbox name.";
  if (new TextEncoder().encode(name).length > POSTBOX_NAME_LIMIT)
    return "Choose a shorter postbox name. Emoji and accented letters use more space.";
  return undefined;
}
