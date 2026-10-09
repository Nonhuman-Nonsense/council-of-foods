import nonhumanLogo from "@assets/logos/nonhuman_nonsense_logo.png";
import euLogo from "@assets/logos/logos_eu-white-starts-white.webp";
import type { CreditGroup, CreditLogo } from "./creditsTypes";

/**
 * Who made the council, as its credits roll (Credits.tsx). This file differs between Council of
 * Foods and Council of Forest; the intro and funding lines are `credits.*` in the locales.
 *
 * Council of Foods keeps its protocol ending, so it never reaches the credits: a placeholder,
 * to be filled in before Foods ends in printed letters.
 */
export const CREDIT_GROUPS: CreditGroup[] = [];

/** The logos at the end of the roll, row by row. */
export const CREDIT_LOGOS: CreditLogo[][] = [
  [{ src: nonhumanLogo, alt: { name: "Nonhuman Nonsense" } }],
  [{ src: euLogo, alt: { key: "contact.euImageAlt" }, small: true }],
];
