import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
  },
  plugins: [
    react(),
    dts({
      include: ["src"],
      insertTypesEntry: true,
      rollupTypes: true,
      outDir: "dist",
      entryRoot: "src",
      // This should force .d.ts extension
      beforeWriteFile: (filePath, content) => {
        // Change .d.mts to .d.ts
        return {
          filePath: filePath.replace(".d.mts", ".d.ts"),
          content,
        };
      },
    }),
  ],
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        // React-free entry, see src/auth.ts
        auth: path.resolve(__dirname, "src/auth.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.mjs`,
      cssFileName: "index",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime", // Add this
        "react-cookie",
        "react-intl",
        // Must NOT be bundled: a second copy means a second React context,
        // so the app's useAuth() would not see our AuthProvider.
        "react-oidc-context",
        "oidc-client-ts",
        "@mantine/core",
        "@mantine/hooks",
        "@mantine/form",
        "@fortawesome/fontawesome-svg-core",
        "@fortawesome/free-regular-svg-icons",
        "@fortawesome/free-solid-svg-icons",
        "@fortawesome/react-fontawesome",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
        },
      },
    },
    cssCodeSplit: false,
  },
});
