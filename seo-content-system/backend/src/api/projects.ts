import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { projects } from "../db/schema.js";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { ValidationError, NotFoundError, AppError } from "../utils/errors.js";

const app = new Hono();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  siteName: z.string().min(1).max(255),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/), // e.g., zh-CN, en-US
  language: z.string().min(1).max(50),
  defaultEngine: z.string().default("google"),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

// GET /api/projects
app.get("/", async (c) => {
  try {
    const ownerId = c.req.header("x-user-id");
    if (!ownerId) {
      return c.json(
        { code: "UNAUTHORIZED", message: "User ID not found" },
        401,
      );
    }

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, ownerId));

    return c.json({ data: userProjects, count: userProjects.length });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to fetch projects" },
      500,
    );
  }
});

// GET /api/projects/:id
app.get("/:id", async (c) => {
  try {
    const projectId = c.req.param("id");
    const ownerId = c.req.header("x-user-id");

    if (!ownerId) {
      return c.json(
        { code: "UNAUTHORIZED", message: "User ID not found" },
        401,
      );
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (project.length === 0) {
      return c.json({ code: "NOT_FOUND", message: "Project not found" }, 404);
    }

    const proj = project[0];

    // Check ownership
    if (proj.ownerId !== ownerId) {
      return c.json({ code: "FORBIDDEN", message: "Access denied" }, 403);
    }

    return c.json({ data: proj });
  } catch (error) {
    console.error("Error fetching project:", error);
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to fetch project" },
      500,
    );
  }
});

// POST /api/projects
app.post("/", async (c) => {
  try {
    const ownerId = c.req.header("x-user-id");
    if (!ownerId) {
      return c.json(
        { code: "UNAUTHORIZED", message: "User ID not found" },
        401,
      );
    }

    const body = await c.req.json();
    const validated = createProjectSchema.parse(body);

    const newProject = {
      id: uuid(),
      ownerId,
      name: validated.name,
      siteName: validated.siteName,
      locale: validated.locale,
      language: validated.language,
      defaultEngine: validated.defaultEngine,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };

    await db.insert(projects).values(newProject);

    return c.json({ data: newProject }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        { code: "VALIDATION_ERROR", message: error.errors[0].message },
        400,
      );
    }
    console.error("Error creating project:", error);
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to create project" },
      500,
    );
  }
});

// PATCH /api/projects/:id
app.patch("/:id", async (c) => {
  try {
    const projectId = c.req.param("id");
    const ownerId = c.req.header("x-user-id");

    if (!ownerId) {
      return c.json(
        { code: "UNAUTHORIZED", message: "User ID not found" },
        401,
      );
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (project.length === 0) {
      return c.json({ code: "NOT_FOUND", message: "Project not found" }, 404);
    }

    if (project[0].ownerId !== ownerId) {
      return c.json({ code: "FORBIDDEN", message: "Access denied" }, 403);
    }

    const body = await c.req.json();
    const updateData = {
      ...body,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    await db.update(projects).set(updateData).where(eq(projects.id, projectId));

    const updated = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    return c.json({ data: updated[0] });
  } catch (error) {
    console.error("Error updating project:", error);
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to update project" },
      500,
    );
  }
});

export default app;
