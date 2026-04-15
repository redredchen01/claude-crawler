/**
 * SERP Preview Component Tests
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { SerpPreview } from "../../src/components/SerpPreview";

describe("SerpPreview Component", () => {
  describe("English truncation rules", () => {
    it("should NOT truncate title under 60 characters", () => {
      const title = "How to Bake Perfect Cookies";
      render(
        <SerpPreview
          title={title}
          description="Learn the best techniques"
          language="en"
        />,
      );
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    it("should truncate title over 60 characters with warning", () => {
      const title =
        "How to Bake the Perfect Cookies Using Advanced Baking Techniques and Methods";
      render(
        <SerpPreview
          title={title}
          description="Learn techniques"
          language="en"
        />,
      );
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/⚠️ Truncated/)).toBeInTheDocument();
    });

    it("should NOT truncate description under 160 characters", () => {
      const description =
        "Learn the best techniques for perfect cookies including ingredients and timing";
      render(
        <SerpPreview
          title="Cookies Guide"
          description={description}
          language="en"
        />,
      );
      expect(screen.getByText(description)).toBeInTheDocument();
    });

    it("should truncate description over 160 characters with warning", () => {
      const description =
        "Learn the best techniques for perfect cookies including all ingredients timing and steps needed to create delicious golden brown cookies that taste amazing";
      render(
        <SerpPreview title="Cookies" description={description} language="en" />,
      );
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
    });
  });

  describe("Chinese truncation rules", () => {
    it("should NOT truncate title under 30 characters (Chinese)", () => {
      const title = "如何制作完美的饼干";
      render(
        <SerpPreview title={title} description="学习最佳技巧" language="zh" />,
      );
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    it("should truncate title over 30 characters with warning (Chinese)", () => {
      const title = "如何制作完美的饼干使用先进的烘焙技术和方法";
      render(
        <SerpPreview title={title} description="学习技巧" language="zh" />,
      );
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/⚠️ Truncated/)).toBeInTheDocument();
    });

    it("should NOT truncate description under 80 characters (Chinese)", () => {
      const description = "学习制作完美饼干的最佳技术，包括所有配料和步骤";
      render(
        <SerpPreview
          title="饼干指南"
          description={description}
          language="zh"
        />,
      );
      expect(screen.getByText(description)).toBeInTheDocument();
    });

    it("should truncate description over 80 characters with warning (Chinese)", () => {
      const description =
        "学习制作完美饼干的最佳技术，包括所有配料、烘烤步骤和冷却时间，以确保获得美味的金黄色饼干";
      render(
        <SerpPreview title="饼干" description={description} language="zh" />,
      );
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
    });
  });

  describe("Visual elements", () => {
    it("should display URL in green", () => {
      const { container } = render(
        <SerpPreview
          title="Test"
          description="Test desc"
          language="en"
          url="example.com"
        />,
      );
      const urlElement =
        container.querySelector('[style*="color: rgb(0, 102, 33)"]') ||
        container.querySelector('[style*="color: #006621"]');
      expect(urlElement).toBeInTheDocument();
    });

    it("should display custom URL", () => {
      render(
        <SerpPreview
          title="Test"
          description="Test"
          language="en"
          url="mysite.com"
        />,
      );
      expect(screen.getByText("mysite.com")).toBeInTheDocument();
    });

    it("should display default URL when not provided", () => {
      render(<SerpPreview title="Test" description="Test" language="en" />);
      expect(screen.getByText("example.com")).toBeInTheDocument();
    });

    it("should show character count details when expanded", () => {
      const { container } = render(
        <SerpPreview
          title="Test Title with Many Characters Here in English"
          description="Test description"
          language="en"
        />,
      );
      expect(screen.getByText(/Character counts/)).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty title", () => {
      render(<SerpPreview title="" description="Description" language="en" />);
      expect(screen.getByText("Description")).toBeInTheDocument();
    });

    it("should handle empty description", () => {
      render(<SerpPreview title="Title" description="" language="en" />);
      expect(screen.getByText("Title")).toBeInTheDocument();
    });

    it("should handle very long title correctly", () => {
      const veryLongTitle =
        "This is an extremely long title that definitely exceeds the character limit for search results and should be truncated";
      render(
        <SerpPreview title={veryLongTitle} description="Short" language="en" />,
      );
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
    });

    it("should handle mixed English and Chinese (English mode)", () => {
      render(
        <SerpPreview
          title="Cookie饼干 Guide"
          description="Learn to bake"
          language="en"
        />,
      );
      expect(screen.getByText(/Cookie饼干 Guide/)).toBeInTheDocument();
    });
  });
});
