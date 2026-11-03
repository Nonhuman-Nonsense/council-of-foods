import React from "react";

/** A stretch of a subtitle sentence, in italics or not. */
export interface EmphasisRun {
  text: string;
  italic: boolean;
}

/** An asterisk with whitespace (or nothing) on both sides is a character, never emphasis: "5 * 3". */
function isLoneAsterisk(text: string, index: number): boolean {
  const before = index === 0 ? " " : text[index - 1];
  const after = index === text.length - 1 ? " " : text[index + 1];
  return /\s/.test(before) && /\s/.test(after);
}

/**
 * The model's `*…*` (emphasis, or a stage direction like `*hooves shuffle*`) as italics, without
 * the asterisks. Takes all of a turn's subtitle sentences, because the sentence splitter can cut
 * an emphasised phrase in two: italics opened in one sentence carry into the next. Pairs are taken
 * in order; an asterisk left without a partner stays a plain asterisk, so no text is ever lost.
 */
export function emphasisRuns(sentences: string[]): EmphasisRun[][] {
  const delimiters = sentences.map(() => new Set<number>());
  const all: Array<[number, number]> = [];
  sentences.forEach((text, s) => {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "*" && !isLoneAsterisk(text, i)) all.push([s, i]);
    }
  });
  const paired = all.length % 2 === 0 ? all : all.slice(0, -1);
  for (const [s, i] of paired) delimiters[s].add(i);

  let italic = false;
  return sentences.map((text, s) => {
    const runs: EmphasisRun[] = [];
    let current = "";
    const flush = () => {
      if (current) runs.push({ text: current, italic });
      current = "";
    };
    for (let i = 0; i < text.length; i++) {
      if (delimiters[s].has(i)) {
        flush();
        italic = !italic;
      } else {
        current += text[i];
      }
    }
    flush();
    return runs;
  });
}

export function renderEmphasisRuns(runs: EmphasisRun[]): React.ReactNode {
  // Keyed by where each run starts in the sentence, which is what identifies it.
  let offset = 0;
  return runs.map((run) => {
    const key = offset;
    offset += run.text.length;
    return run.italic ? <em key={key}>{run.text}</em> : <React.Fragment key={key}>{run.text}</React.Fragment>;
  });
}
