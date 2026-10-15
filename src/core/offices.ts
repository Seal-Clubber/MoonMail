import existing from "../../public/deployment.json" with { type: "json" };
import sealed from "../../public/deployment-v4.json" with { type: "json" };
import { officeProfile } from "./office-profile";
import { sameContext } from "./links";
import type { Context } from "./types";

export type OfficeChoice = "existing" | "sealed";
const key = "moonmail:office:v1";
export const officeFile = (choice: OfficeChoice) =>
  choice === "sealed" ? "deployment-v4.json" : "deployment.json";
export function rememberedOffice(
  storage: Pick<Storage, "getItem">,
): OfficeChoice {
  try {
    return storage.getItem(key) === "sealed" ? "sealed" : "existing";
  } catch {
    return "existing";
  }
}
export function rememberOffice(
  storage: Pick<Storage, "setItem">,
  choice: OfficeChoice,
) {
  try {
    storage.setItem(key, choice);
  } catch {
    /* Optional public preference. */
  }
}
export function knownOffice(context: Context): OfficeChoice | undefined {
  if (sameContext(context, existing)) return "existing";
  if (sameContext(context, sealed)) return "sealed";
}
export function reviewedOffice(choice: OfficeChoice) {
  return officeProfile(choice === "sealed" ? sealed : existing);
}
