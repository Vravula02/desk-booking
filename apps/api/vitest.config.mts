import { defineConfig } from "vitest/config";
import "dotenv/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});