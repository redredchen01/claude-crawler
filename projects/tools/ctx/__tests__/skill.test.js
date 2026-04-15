const fs = require("fs");
const path = require("path");

describe("SKILL.md constraints", () => {
  const skillPath = path.join(__dirname, "..", "SKILL.md");

  it("should exist", () => {
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  it("should be under 2KB (budget for free users)", () => {
    const stat = fs.statSync(skillPath);
    expect(stat.size).toBeLessThanOrEqual(2048);
  });

  it("should be under 100 lines", () => {
    const content = fs.readFileSync(skillPath, "utf8");
    const lines = content.split("\n").length;
    expect(lines).toBeLessThanOrEqual(100);
  });

  it("should have valid frontmatter", () => {
    const content = fs.readFileSync(skillPath, "utf8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name:");
    expect(content).toContain("description:");
    expect(content).toContain("allowed-tools:");
  });

  it("should reference state.json for disk-backed state", () => {
    const content = fs.readFileSync(skillPath, "utf8");
    expect(content).toContain("state.json");
  });

  it("should contain threshold definitions", () => {
    const content = fs.readFileSync(skillPath, "utf8");
    expect(content).toMatch(/40/);
    expect(content).toMatch(/60/);
    expect(content).toMatch(/80/);
  });

  it("should not contain verbose explanations (keep it tight)", () => {
    const content = fs.readFileSync(skillPath, "utf8");
    // No paragraphs longer than 200 chars (forces concise writing)
    const paragraphs = content.split(/\n\n+/);
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed.startsWith("|") && !trimmed.startsWith("```") && !trimmed.startsWith("---")) {
        expect(trimmed.length).toBeLessThanOrEqual(300);
      }
    }
  });
});

describe("SKILL-full.md", () => {
  const fullPath = path.join(__dirname, "..", "SKILL-full.md");

  it("should exist", () => {
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it("should be larger than SKILL.md", () => {
    const skillSize = fs.statSync(path.join(__dirname, "..", "SKILL.md")).size;
    const fullSize = fs.statSync(fullPath).size;
    expect(fullSize).toBeGreaterThan(skillSize);
  });
});
