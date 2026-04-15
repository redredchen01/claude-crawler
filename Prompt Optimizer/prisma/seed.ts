import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const demoRecords = [
  {
    raw_prompt: "Write code",
    raw_score: {
      total: 35,
      dimensions: {
        specificity: 5,
        context: 5,
        output_spec: 10,
        runnability: 5,
        evaluation: 5,
        safety: 0,
      },
      missing_slots: ["task", "language", "context", "constraints"],
      issues: "Extremely vague",
      diagnostics: "Lacks essential information",
    },
    optimized_prompt:
      "Write Python code to calculate factorial with edge case handling and unit tests. Return a complete, runnable script.",
    optimized_score: {
      total: 82,
      dimensions: {
        specificity: 18,
        context: 16,
        output_spec: 19,
        runnability: 14,
        evaluation: 12,
        safety: 3,
      },
      missing_slots: [],
      issues: "Minor: Could specify Python version",
      diagnostics: "Strong prompt with clear task definition",
    },
    optimization_explanation:
      "Added language (Python), task details (factorial), requirements (edge cases, tests), and output format",
  },
  {
    raw_prompt: "Analyze this data",
    raw_score: {
      total: 40,
      dimensions: {
        specificity: 8,
        context: 6,
        output_spec: 12,
        runnability: 6,
        evaluation: 6,
        safety: 2,
      },
      missing_slots: [
        "input_material",
        "goal",
        "output_format",
        "success_metric",
      ],
      issues: "Missing data context and analysis goal",
      diagnostics: "Needs specification of what data and what kind of analysis",
    },
    optimized_prompt:
      "Analyze the provided CSV file containing sales data for Q1 2024. Identify top 5 products by revenue, calculate monthly trends, and suggest optimization opportunities. Format output as a markdown report with tables and charts.",
    optimized_score: {
      total: 88,
      dimensions: {
        specificity: 20,
        context: 18,
        output_spec: 20,
        runnability: 15,
        evaluation: 10,
        safety: 5,
      },
      missing_slots: [],
      issues: "None",
      diagnostics:
        "Excellent prompt with clear task, data source, and output format",
    },
    optimization_explanation:
      "Specified data source (CSV), added concrete analysis goals, defined output format and metrics",
  },
];

async function main() {
  console.log("Seeding database...");

  for (const record of demoRecords) {
    await prisma.optimizationRecord.create({
      data: {
        raw_prompt: record.raw_prompt,
        raw_score: JSON.stringify(record.raw_score),
        optimized_prompt: record.optimized_prompt,
        optimized_score: JSON.stringify(record.optimized_score),
        optimization_explanation: record.optimization_explanation,
      },
    });
  }

  console.log("✓ Database seeded with", demoRecords.length, "records");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
