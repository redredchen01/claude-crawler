/**
 * Mock SERP Data Provider
 *
 * Returns realistic mock SERP results for testing
 * Behavior is deterministic based on query for reproducibility
 */

import {
  BaseSerpDataProvider,
  SerpQuery,
  SerpResult,
  ISerpDataProvider,
} from "./serpDataProvider";

export class MockSerpDataProvider
  extends BaseSerpDataProvider
  implements ISerpDataProvider
{
  /**
   * Mock SERP results database (by topic)
   */
  private mockDatabase: Record<string, SerpResult[]> = {
    // Web Development
    "web development": [
      {
        position: 1,
        title: "Web Development Tutorials - MDN Web Docs",
        description:
          "Learn web development with free tutorials. Start with HTML, CSS, and JavaScript basics...",
        url: "https://developer.mozilla.org/en-US/docs/Learn",
        domain: "developer.mozilla.org",
        relevanceScore: 0.95,
      },
      {
        position: 2,
        title: "Web Development Courses | Udemy",
        description:
          "Become a web developer. Learn HTML5, CSS3, JavaScript, and more with hands-on projects...",
        url: "https://www.udemy.com/courses/web-development/",
        domain: "udemy.com",
        relevanceScore: 0.88,
      },
      {
        position: 3,
        title: "Web Development Guide for Beginners",
        description:
          "Complete guide to starting your web development career. Learn frontend and backend skills...",
        url: "https://www.freecodecamp.org/web-dev",
        domain: "freecodecamp.org",
        relevanceScore: 0.92,
      },
    ],
    // React
    react: [
      {
        position: 1,
        title: "React – A JavaScript library for building user interfaces",
        description:
          "React makes creating interactive UIs painless. Design simple views for each state in your application...",
        url: "https://react.dev",
        domain: "react.dev",
        relevanceScore: 0.99,
      },
      {
        position: 2,
        title: "React Tutorial: Learn React Basics",
        description:
          "Get started with React. Learn about components, JSX, hooks, and state management...",
        url: "https://react.dev/learn",
        domain: "react.dev",
        relevanceScore: 0.97,
      },
      {
        position: 3,
        title: "React.js Courses and Training",
        description:
          "Master React.js development. From beginner to advanced. Build real-world applications...",
        url: "https://www.coursera.org/learn/react",
        domain: "coursera.org",
        relevanceScore: 0.85,
      },
    ],
    // Python
    python: [
      {
        position: 1,
        title: "Welcome to Python.org",
        description:
          "Official Python website. Download Python, learn about the language, and find resources...",
        url: "https://www.python.org",
        domain: "python.org",
        relevanceScore: 0.98,
      },
      {
        position: 2,
        title: "Python Programming Tutorials - Real Python",
        description:
          "Learn Python programming from beginner to advanced. Articles, courses, and code examples...",
        url: "https://realpython.com",
        domain: "realpython.com",
        relevanceScore: 0.93,
      },
      {
        position: 3,
        title: "Python for Everybody",
        description:
          "Free Python courses and materials. Suitable for beginners who want to learn programming...",
        url: "https://www.py4e.com",
        domain: "py4e.com",
        relevanceScore: 0.87,
      },
    ],
  };

  async fetch(query: SerpQuery): Promise<SerpResult[]> {
    const normalizedQuery = query.query.toLowerCase();
    const limit = query.limit || 10;

    // Try exact match first
    let results = this.mockDatabase[normalizedQuery];

    // If no exact match, try partial match
    if (!results) {
      const keys = Object.keys(this.mockDatabase);
      const matchedKey = keys.find((key) => normalizedQuery.includes(key));
      results = matchedKey ? this.mockDatabase[matchedKey] : [];
    }

    // If still no results, generate synthetic ones
    if (!results || results.length === 0) {
      results = this.generateSyntheticResults(query.query);
    }

    // Return requested limit
    return results.slice(0, limit);
  }

  /**
   * Generate synthetic SERP results for unknown queries
   */
  private generateSyntheticResults(query: string): SerpResult[] {
    const results: SerpResult[] = [];

    // Generate 5 synthetic results
    for (let i = 1; i <= 5; i++) {
      const domain = `example${i}.com`;
      results.push({
        position: i,
        title: `${query} - Guide and Tutorial ${i}`,
        description: `Learn about ${query}. Complete guide with examples and best practices for ${query}...`,
        url: `https://${domain}/guide-to-${query.replace(/\s+/g, "-")}`,
        domain,
        relevanceScore: 0.8 - i * 0.05,
      });
    }

    return results;
  }

  override async isAvailable(): Promise<boolean> {
    return true;
  }
}
