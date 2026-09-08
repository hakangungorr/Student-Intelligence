import { describe, expect, it } from "vitest";
import { getMode, supabaseConfig } from "../src/lib/config";
describe("fail-closed configuration", () => {
  it("never silently enables demo mode", () => {
    expect(getMode({})).toBe("supabase");
    expect(() => supabaseConfig({})).toThrow();
    expect(() => getMode({APP_DATA_MODE:"typo"})).toThrow();
  });
  it("requires explicit demo mode", () => expect(getMode({APP_DATA_MODE:"demo"})).toBe("demo"));
  it("validates a configured production project", () => {
    expect(supabaseConfig({NEXT_PUBLIC_SUPABASE_URL:"https://test.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_example"}).url).toBe("https://test.supabase.co");
  });
});
