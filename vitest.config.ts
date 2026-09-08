import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The tests import application modules directly, so they need the same "@/"
// alias tsconfig gives the app. Without it the engine port could only be tested
// through a copy of itself, which is not a test.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }
});
