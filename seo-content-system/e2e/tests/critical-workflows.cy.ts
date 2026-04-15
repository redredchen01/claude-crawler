/**
 * Critical Workflows E2E Tests
 * Phase 4.1.3: Test essential user journeys
 */

describe("SEO Content System - Critical Workflows", () => {
  beforeEach(() => {
    // Clear any existing state
    cy.clearLocalStorage();
    cy.visit("/");
  });

  describe("Project Management", () => {
    it("should create a new project", () => {
      // Navigate to projects page
      cy.get('[data-testid="nav-projects"]').click();

      // Click create project button
      cy.get('[data-testid="btn-create-project"]').click();

      // Fill form
      cy.get('[data-testid="input-project-name"]').type("Test SEO Project");
      cy.get('[data-testid="input-site-name"]').type("example.com");
      cy.get('[data-testid="select-language"]').select("en");

      // Submit
      cy.get('[data-testid="btn-submit"]').click();

      // Verify success
      cy.get('[data-testid="project-list"]').should(
        "contain",
        "Test SEO Project",
      );
    });

    it("should load existing projects", () => {
      cy.get('[data-testid="nav-projects"]').click();
      cy.get('[data-testid="project-list"]').should("be.visible");
      cy.get('[data-testid="project-item"]').should(
        "have.length.greaterThan",
        0,
      );
    });
  });

  describe("Keyword Job Submission", () => {
    it("should create and monitor keyword job", () => {
      // Select project
      cy.get('[data-testid="nav-jobs"]').click();
      cy.get('[data-testid="btn-new-job"]').click();

      // Enter seed keywords
      cy.get('[data-testid="input-seed-keywords"]').type(
        "react testing{Enter}javascript",
      );

      // Configure job
      cy.get('[data-testid="checkbox-question-modifiers"]').check();
      cy.get('[data-testid="checkbox-commercial-modifiers"]').check();

      // Submit job
      cy.get('[data-testid="btn-submit-job"]').click();

      // Verify job created
      cy.get('[data-testid="job-status"]').should("contain", "pending");

      // Wait for processing
      cy.get('[data-testid="job-status"]', { timeout: 30000 }).should(
        "contain",
        "completed",
      );

      // Verify candidates generated
      cy.get('[data-testid="candidate-count"]').should("contain.number", "0");
    });
  });

  describe("Cluster Management", () => {
    it("should view and filter clusters", () => {
      // Navigate to content planning
      cy.get('[data-testid="nav-content-planning"]').click();

      // View clusters in list mode
      cy.get('[data-testid="mode-button-list"]').click();
      cy.get('[data-testid="clusters-table"]').should("be.visible");

      // Filter by page type
      cy.get('[data-testid="filter-page-type"]').select("article");
      cy.get('[data-testid="cluster-row"]').each(($el) => {
        cy.wrap($el).should("contain", "article");
      });

      // Reset filters
      cy.get('[data-testid="btn-reset-filters"]').click();
    });

    it("should view cluster network visualization", () => {
      cy.get('[data-testid="nav-content-planning"]').click();

      // Switch to visualization mode
      cy.get('[data-testid="mode-button-visualization"]').click();

      // Verify SVG visualization rendered
      cy.get('[data-testid="visualization-svg"]').should("be.visible");
      cy.get('[data-testid="cluster-node"]').should(
        "have.length.greaterThan",
        0,
      );

      // Click cluster to select
      cy.get('[data-testid="cluster-node"]').first().click();
      cy.get('[data-testid="cluster-selected-ring"]').should("be.visible");
    });
  });

  describe("Content Generation", () => {
    it("should generate content plan for cluster", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="mode-button-list"]').click();

      // Select first cluster
      cy.get('[data-testid="cluster-row"]').first().click();

      // Switch to detail view
      cy.get('[data-testid="mode-button-detail"]').click();

      // Generate content
      cy.get('[data-testid="btn-generate-content"]').click();

      // Wait for generation
      cy.get('[data-testid="btn-generate-content"]', { timeout: 30000 }).should(
        "not.have.text",
        "Generating...",
      );

      // Verify content plan sections visible
      cy.get('[data-testid="tab-plan"]').click();
      cy.get('[data-testid="brief-section"]').should("be.visible");
      cy.get('[data-testid="faq-section"]').should("be.visible");
      cy.get('[data-testid="links-section"]').should("be.visible");
    });

    it("should display brief content", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="cluster-row"]').first().click();
      cy.get('[data-testid="mode-button-detail"]').click();
      cy.get('[data-testid="tab-plan"]').click();

      // Verify brief fields
      cy.get('[data-testid="brief-title"]').should("not.be.empty");
      cy.get('[data-testid="brief-meta-description"]').should("not.be.empty");
      cy.get('[data-testid="brief-content-length"]').should(
        "contain.number",
        "0",
      );
    });

    it("should expand FAQ items", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="cluster-row"]').first().click();
      cy.get('[data-testid="mode-button-detail"]').click();
      cy.get('[data-testid="tab-plan"]').click();

      // Expand first FAQ
      cy.get('[data-testid="faq-question"]').first().click();
      cy.get('[data-testid="faq-answer"]').first().should("be.visible");

      // Collapse and expand again
      cy.get('[data-testid="faq-question"]').first().click();
      cy.get('[data-testid="faq-answer"]').first().should("not.be.visible");
    });
  });

  describe("Data Export", () => {
    it("should export clusters to CSV", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="cluster-row"]').first().click();
      cy.get('[data-testid="mode-button-detail"]').click();

      // Trigger CSV export
      cy.get('[data-testid="btn-export-csv"]').click();

      // Verify download started
      cy.readFile(`${Cypress.config("downloadsFolder")}/clusters_*.csv`, {
        timeout: 5000,
      }).should("exist");
    });

    it("should export clusters to JSON", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="cluster-row"]').first().click();
      cy.get('[data-testid="mode-button-detail"]').click();

      // Trigger JSON export
      cy.get('[data-testid="btn-export-json"]').click();

      // Verify download started
      cy.readFile(`${Cypress.config("downloadsFolder")}/clusters_*.json`, {
        timeout: 5000,
      }).should("exist");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing project selection", () => {
      cy.get('[data-testid="nav-content-planning"]').click();

      // Empty state message visible
      cy.get('[data-testid="empty-state"]').should(
        "contain",
        "Select a Project",
      );
    });

    it("should handle API errors gracefully", () => {
      // Intercept and error API call
      cy.intercept("GET", "/api/clusters*", { statusCode: 500 }).as("apiError");

      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="project-selector"]').select("project-1");

      cy.wait("@apiError");

      // Error message displayed
      cy.get('[data-testid="alert-error"]').should("be.visible");
    });
  });

  describe("Responsive Design", () => {
    it("should work on tablet viewport", () => {
      cy.viewport("ipad-2");
      cy.get('[data-testid="nav-projects"]').should("be.visible");
      cy.visit("/");
      cy.get('[data-testid="page-content"]').should("be.visible");
    });

    it("should have mobile navigation", () => {
      cy.viewport("iphone-x");
      cy.get('[data-testid="nav-toggle"]').should("be.visible");
      cy.get('[data-testid="nav-toggle"]').click();
      cy.get('[data-testid="nav-menu"]').should("be.visible");
    });
  });

  describe("Performance", () => {
    it("should load clusters within 2 seconds", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="project-selector"]').select("project-1");

      cy.get('[data-testid="clusters-table"]', { timeout: 2000 }).should(
        "be.visible",
      );
    });

    it("should render cluster visualization without lag", () => {
      cy.get('[data-testid="nav-content-planning"]').click();
      cy.get('[data-testid="mode-button-visualization"]').click();

      // Measure render time
      const start = Date.now();
      cy.get('[data-testid="visualization-svg"]')
        .should("be.visible")
        .then(() => {
          const duration = Date.now() - start;
          expect(duration).to.be.lessThan(3000); // Should load within 3s
        });
    });
  });
});
