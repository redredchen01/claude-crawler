import { GET } from "@/app/api/demo/route";

describe("GET /api/demo", () => {
  test("should return demo record", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    expect(data.id).toBe("demo-1");
  });

  test("should return demo with raw prompt", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("raw_prompt");
    expect(data.raw_prompt).toBe("Write code");
  });

  test("should return demo with raw score", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("raw_score");
    expect(data.raw_score).toHaveProperty("total");
    expect(data.raw_score.total).toBe(35);
    expect(data.raw_score).toHaveProperty("dimensions");
    expect(data.raw_score).toHaveProperty("missing_slots");
    expect(data.raw_score).toHaveProperty("issues");
    expect(data.raw_score).toHaveProperty("diagnostics");
  });

  test("should return demo with optimized prompt", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("optimized_prompt");
    expect(data.optimized_prompt).toContain("Python");
    expect(data.optimized_prompt).toBeTruthy();
  });

  test("should return demo with optimized score", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("optimized_score");
    expect(data.optimized_score).toHaveProperty("total");
    expect(data.optimized_score.total).toBe(82);
    expect(data.optimized_score.total).toBeGreaterThan(data.raw_score.total);
    expect(data.optimized_score).toHaveProperty("dimensions");
    expect(data.optimized_score).toHaveProperty("missing_slots");
  });

  test("should show improvement from raw to optimized score", async () => {
    const response = await GET();
    const data = await response.json();

    const rawTotal = data.raw_score.total;
    const optimizedTotal = data.optimized_score.total;
    expect(optimizedTotal).toBeGreaterThan(rawTotal);
    expect(optimizedTotal - rawTotal).toBeGreaterThan(0);
  });

  test("should return optimization explanation", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("optimization_explanation");
    expect(data.optimization_explanation).toBeTruthy();
    expect(typeof data.optimization_explanation).toBe("string");
  });

  test("should have correct dimension scores in raw score", async () => {
    const response = await GET();
    const data = await response.json();

    const rawDims = data.raw_score.dimensions;
    expect(rawDims).toHaveProperty("specificity");
    expect(rawDims).toHaveProperty("context");
    expect(rawDims).toHaveProperty("output_spec");
    expect(rawDims).toHaveProperty("runnability");
    expect(rawDims).toHaveProperty("evaluation");
    expect(rawDims).toHaveProperty("safety");
  });

  test("should have correct dimension scores in optimized score", async () => {
    const response = await GET();
    const data = await response.json();

    const optimizedDims = data.optimized_score.dimensions;
    expect(optimizedDims).toHaveProperty("specificity");
    expect(optimizedDims).toHaveProperty("context");
    expect(optimizedDims).toHaveProperty("output_spec");
    expect(optimizedDims).toHaveProperty("runnability");
    expect(optimizedDims).toHaveProperty("evaluation");
    expect(optimizedDims).toHaveProperty("safety");
  });

  test("should show improved dimensions after optimization", async () => {
    const response = await GET();
    const data = await response.json();

    const rawDims = data.raw_score.dimensions;
    const optimizedDims = data.optimized_score.dimensions;

    expect(optimizedDims.specificity).toBeGreaterThan(rawDims.specificity);
    expect(optimizedDims.context).toBeGreaterThan(rawDims.context);
    expect(optimizedDims.output_spec).toBeGreaterThan(rawDims.output_spec);
  });

  test("should have empty missing_slots in optimized score", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.optimized_score.missing_slots).toEqual([]);
  });

  test("should have missing_slots in raw score", async () => {
    const response = await GET();
    const data = await response.json();

    expect(Array.isArray(data.raw_score.missing_slots)).toBe(true);
    expect(data.raw_score.missing_slots.length).toBeGreaterThan(0);
  });

  test("should have created_at timestamp", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("created_at");
    expect(typeof data.created_at).toBe("string");
    // Verify it's a valid ISO string
    expect(() => new Date(data.created_at)).not.toThrow();
  });

  test("should return JSON content type", async () => {
    const response = await GET();

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("should return 200 status", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
  });

  test("should show realistic improvement example", async () => {
    const response = await GET();
    const data = await response.json();

    // Demo should show realistic improvement (not too little, not too much)
    const improvement = data.optimized_score.total - data.raw_score.total;
    expect(improvement).toBeGreaterThan(20);
    expect(improvement).toBeLessThan(100);
  });

  test("should have valid score structure with positive values", async () => {
    const response = await GET();
    const data = await response.json();

    // Verify all dimensions are positive numbers
    const rawDims = data.raw_score.dimensions;
    expect(rawDims.specificity).toBeGreaterThan(0);
    expect(rawDims.context).toBeGreaterThan(0);
    expect(rawDims.output_spec).toBeGreaterThan(0);
    expect(rawDims.runnability).toBeGreaterThan(0);
    expect(rawDims.evaluation).toBeGreaterThan(0);
    expect(rawDims.safety).toBeGreaterThanOrEqual(0);

    // Verify optimized dimensions are also positive
    const optimizedDims = data.optimized_score.dimensions;
    expect(optimizedDims.specificity).toBeGreaterThan(0);
    expect(optimizedDims.context).toBeGreaterThan(0);
    expect(optimizedDims.output_spec).toBeGreaterThan(0);
    expect(optimizedDims.runnability).toBeGreaterThan(0);
    expect(optimizedDims.evaluation).toBeGreaterThan(0);
  });
});
