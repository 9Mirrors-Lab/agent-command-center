import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@acc/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: Number(process.env.ACC_CLIENT_PORT) || 4201,
    proxy: {
      "/api": "http://localhost:4200",
      "/ws": {
        target: "http://localhost:4200",
        ws: true,
      },
    },
  },
});
