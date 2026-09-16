import type { CSSProperties } from "react";

/** Her kurun kendi rengi.
 *
 *  A language school already thinks of its levels as a sequence, and the chip
 *  makes that sequence visible: the same level is the same colour on the agenda,
 *  the heat map, the list and the card. The hue runs from cyan to orchid across
 *  whatever levels the institution configured, so a school with three levels or
 *  eight gets an even spread without anybody picking colours.
 *
 *  The range deliberately stays out of the red–amber–green band the risk states
 *  use: a level is a fact about the course, never a verdict about the student.
 */
const FROM = 188, TO = 284;

export function levelHue(level: string, levels: string[]): number {
  const key = level.toLocaleLowerCase("tr");
  const i = levels.findIndex(l => l.toLocaleLowerCase("tr") === key);
  if (i < 0) return 220;
  return Math.round(FROM + (levels.length > 1 ? i / (levels.length - 1) : 0) * (TO - FROM));
}

export const levelStyle = (level: string, levels: string[]) =>
  ({ "--lv": levelHue(level, levels) }) as CSSProperties;

export function Level({ level, levels }: { level: string; levels: string[] }) {
  return <span className="lvl" style={levelStyle(level, levels)}>{level}</span>;
}
