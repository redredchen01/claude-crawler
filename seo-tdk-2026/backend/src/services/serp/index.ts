/**
 * SERP Services Module
 *
 * Exports SERP data provider and related utilities
 */

import { MockSerpDataProvider } from "./mockSerpDataProvider";
import type { ISerpDataProvider } from "./serpDataProvider";

/**
 * Get singleton SERP data provider
 *
 * MVP: Always returns MockSerpDataProvider
 * Future: Switch implementation based on env vars
 */
export function getSerpDataProvider(): ISerpDataProvider {
  const providerType = process.env.SERP_PROVIDER_TYPE || "mock";

  switch (providerType) {
    case "mock":
    default:
      return new MockSerpDataProvider();
  }
}

export { MockSerpDataProvider };
export type { ISerpDataProvider, SerpResult, SerpQuery } from "./serpDataProvider";
