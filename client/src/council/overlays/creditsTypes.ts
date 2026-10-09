/** Words to translate (a locale key), or a name as it is. */
export type CreditText = { key: string } | { name: string };

/** One line of the credits: what they did (or where they are from) on the left, who on the right. */
export interface CreditLine {
  role: CreditText;
  names: string[];
}

export interface CreditGroup {
  headingKey?: string;
  credits: CreditLine[];
}

/** Sized as on the contact page, in pixels. */
export interface CreditLogo {
  src: string;
  alt: CreditText;
  maxWidth: number;
  height: number;
}
