/**
 * Cypress Configuration
 * Phase 4.1.3: E2E testing for SEO Content System
 */

import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    chromeWebSecurity: false,

    setupNodeEvents(on, config) {
      // Implement node event listeners here
    },

    spec: "e2e/tests/**/*.cy.ts",
    supportFile: "e2e/support/e2e.ts",
  },

  component: {
    devServer: {
      framework: "react",
      bundler: "vite",
    },
  },
});
