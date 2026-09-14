import { describe, it, expect } from "vitest";
import { retrying, worthRetrying } from "../src/lib/retry";

/** Which failures are worth asking again about.
 *
 *  The distinction matters in both directions: not retrying a restart turns a
 *  one-second hiccup into an error page, and retrying a permission denial just
 *  makes the wrong answer arrive slower.
 */
const attempts = <T>(results: { data: T | null; error: { message: string; code?: string } | null }[]) => {
  let n = 0;
  return { run: () => Promise.resolve(results[Math.min(n++, results.length - 1)]), calls: () => n };
};

describe("deciding what to retry", () => {
  it("retries a failure the database never decided", () => {
    expect(worthRetrying({ message: "Failed to get project config" })).toBe(true);
  });

  it("retries a schema cache that has not caught up", () => {
    expect(worthRetrying({ message: "not in schema cache", code: "PGRST205" })).toBe(true);
  });

  it("does not retry a permission denial", () => {
    expect(worthRetrying({ message: "permission denied", code: "42501" })).toBe(false);
  });

  it("does not retry a column that does not exist", () => {
    expect(worthRetrying({ message: "column does not exist", code: "42703" })).toBe(false);
  });
});

describe("retrying a read", () => {
  it("returns the first success without asking again", async () => {
    const a = attempts([{ data: [1], error: null }]);
    expect((await retrying(a.run)).data).toEqual([1]);
    expect(a.calls()).toBe(1);
  });

  it("waits out a restart and returns the answer that follows", async () => {
    const a = attempts([
      { data: null, error: { message: "Failed to get project config" } },
      { data: [2], error: null }
    ]);
    const result = await retrying(a.run);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([2]);
    expect(a.calls()).toBe(2);
  });

  it("gives the decided answer back immediately, without retrying it", async () => {
    const a = attempts([{ data: null, error: { message: "permission denied", code: "42501" } }]);
    const result = await retrying(a.run);
    expect(result.error?.code).toBe("42501");
    expect(a.calls()).toBe(1);
  });

  it("stops after three attempts and hands back the last failure", async () => {
    const a = attempts([{ data: null, error: { message: "Failed to get project config" } }]);
    const result = await retrying(a.run);
    expect(result.error?.message).toBe("Failed to get project config");
    expect(a.calls()).toBe(3);
  });
});
