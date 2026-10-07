import {
  createPostboxLink,
  parsePostboxLink,
  type PostboxRoute,
} from "./postbox-links";
export type PublicLetterRoute = PostboxRoute;
export function createPublicLetterLink(base: string, route: PublicLetterRoute) {
  const u = new URL(createPostboxLink(base, route));
  u.hash = u.hash.replace("#/postbox/", "#/mail/");
  return u.href;
}
export function parsePublicLetterLink(hash: string): PublicLetterRoute | null {
  if (!hash.startsWith("#/mail/")) return null;
  try {
    return parsePostboxLink(hash.replace("#/mail/", "#/postbox/"));
  } catch {
    throw new Error(
      "Invalid public letter link. Ask its sender for the complete link.",
    );
  }
}
