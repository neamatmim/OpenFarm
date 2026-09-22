import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig(({ command }) => ({
  // The deploy artifact has no workspace node_modules tree. Development still
  // externalizes Node-oriented CommonJS packages such as `pg`, which Vite's
  // module runner cannot safely inline.
  ssr: command === "build" ? { noExternal: true } : undefined,
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // Nitro defaults to node-server for Docker/systemd and detects Vercel's
    // Build Output API when Vercel runs the build.
    nitro(),
    viteReact(),
  ],
}));
