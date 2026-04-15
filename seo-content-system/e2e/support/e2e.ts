/**
 * Cypress Support File
 * Phase 4.1.3: Global test setup and utilities
 */

beforeEach(() => {
  // Reset API mocks and state before each test
  cy.clearLocalStorage();
});

// Custom commands
Cypress.Commands.add("login", (email: string = "test@example.com") => {
  // Mock login if needed
  cy.localStorage("auth_token", "mock-token");
});

Cypress.Commands.add("seedDatabase", () => {
  // Seed test data via API
  cy.request("POST", "/api/test/seed", {
    projects: 2,
    jobs: 3,
    clusters: 10,
  });
});

// Handle uncaught exceptions in the app
Cypress.on("uncaught:exception", (err, runnable) => {
  // Return false to prevent Cypress from failing the test
  if (err.message.includes("ResizeObserver")) {
    return false;
  }
  return true;
});

// Configure intercepts for common API calls
beforeEach(() => {
  cy.intercept("GET", "/api/projects", {
    statusCode: 200,
    body: {
      projects: [
        {
          id: "project-1",
          name: "Test Project",
          siteName: "example.com",
          locale: "en-US",
          language: "en",
          defaultEngine: "google",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  }).as("getProjects");
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string): Chainable<void>;
      seedDatabase(): Chainable<void>;
    }
  }
}

export {};
