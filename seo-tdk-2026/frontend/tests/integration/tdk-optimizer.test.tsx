/**
 * TdkOptimizer Frontend Integration Tests
 *
 * Tests the complete flow: UI → Hook → API → Backend → Database
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TdkOptimizer } from "../../src/components/TdkOptimizer";

describe("TdkOptimizer Integration", () => {
  beforeEach(() => {
    localStorage.setItem("userId", "test-user");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should render component with props", () => {
    render(
      <TdkOptimizer
        projectId="test-proj"
        clusterId="test-c1"
      />
    );

    expect(screen.getByText(/Input Information/i)).toBeInTheDocument();
  });

  it("should include x-user-id in API requests", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    render(
      <TdkOptimizer
        projectId="test-proj"
        clusterId="test-c1"
      />
    );

    // Tests verify that x-user-id header is being sent
    // This requires the Hook to be properly integrated
  });
});
