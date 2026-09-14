import { describe, it, expect } from "vitest";
import { readEdits, fieldsOf } from "../src/lib/entry";

/** What the hand-entry forms post, and what it is allowed to mean.
 *
 *  An unticked checkbox sends nothing at all, which is indistinguishable from a
 *  row nobody touched — so the form states what the box said when it was drawn,
 *  and only a box that was ticked before may be read as a deliberate "hayır".
 */
const classroom = fieldsOf("classroom");
const sheet = (entries: [string, string][]) => {
  const form = new FormData();
  for (const [k, v] of entries) form.append(k, v);
  return form;
};

describe("reading a classroom sheet", () => {
  it("leaves an untouched row alone instead of recording no concern", () => {
    const { edits } = readEdits(sheet([
      ["v:s1:term_rate", ""], ["v:s1:last_four_weeks", ""],
      ["v:s1:participation", ""], ["v:s1:homework", ""], ["p:s1:concern", "0"]
    ]), classroom);
    expect(edits[0].values.concern).toBeNull();
    expect(Object.values(edits[0].values).every(v => v === null)).toBe(true);
  });

  it("reads an unticked box as no concern when it was ticked before", () => {
    const { edits } = readEdits(sheet([["p:s1:concern", "1"]]), classroom);
    expect(edits[0].values.concern).toBe(false);
  });

  it("reads a ticked box as a concern", () => {
    const { edits } = readEdits(sheet([["p:s1:concern", "0"], ["v:s1:concern", "on"]]), classroom);
    expect(edits[0].values.concern).toBe(true);
  });

  it("names the student a rejected value came from", () => {
    const { edits, problems } = readEdits(sheet([
      ["v:s1:participation", "8"], ["v:s2:participation", "12"]
    ]), classroom);
    expect(problems).toEqual([
      { studentId: "s2", field: "participation", label: "Katılım /10", text: "12" }
    ]);
    expect(edits.find(e => e.studentId === "s1")!.values.participation).toBe(8);
  });

  it("takes a comma as a decimal point, the way a Turkish keyboard writes one", () => {
    const { edits, problems } = readEdits(sheet([["v:s1:term_rate", "87,5"]]), classroom);
    expect(problems).toEqual([]);
    expect(edits[0].values.term_rate).toBe(87.5);
  });
});
