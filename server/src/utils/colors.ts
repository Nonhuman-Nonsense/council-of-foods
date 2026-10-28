import { styleText } from "node:util";

// Terminal colours. styleText leaves them out when stdout is not a terminal or NO_COLOR is set.
const style = (format: Parameters<typeof styleText>[0]) => (text: string) => styleText(format, text);

export const red = style("red");
export const yellow = style("yellow");
export const green = style("green");
export const blue = style("blue");
export const magenta = style("magenta");
export const cyan = style("cyan");
export const gray = style("gray");
export const bold = style("bold");
