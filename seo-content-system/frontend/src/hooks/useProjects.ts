/**
 * useProjects Hook
 * Phase 4.1: CRUD operations for projects
 */

import { useState, useCallback } from "react";
import type { Project } from "../types/api";

interface UseProjectsReturn {
  projects: Project[];
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ) => Promise<Project>;
  getProject: (id: string) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error("Failed to fetch projects");

      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch projects";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createProject = useCallback(
    async (projectData: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
      setError(null);

      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData),
        });

        if (!response.ok) throw new Error("Failed to create project");

        const data = await response.json();
        const newProject = data.project;

        setProjects((prev) => [...prev, newProject]);
        return newProject;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create project";
        setError(message);
        throw err;
      }
    },
    [],
  );

  const getProject = useCallback(async (id: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/projects/${id}`);
      if (!response.ok) throw new Error("Failed to fetch project");

      const data = await response.json();
      return data.project;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch project";
      setError(message);
      throw err;
    }
  }, []);

  const updateProject = useCallback(
    async (id: string, updates: Partial<Project>) => {
      setError(null);

      try {
        const response = await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) throw new Error("Failed to update project");

        const data = await response.json();
        const updatedProject = data.project;

        setProjects((prev) =>
          prev.map((p) => (p.id === id ? updatedProject : p)),
        );

        return updatedProject;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update project";
        setError(message);
        throw err;
      }
    },
    [],
  );

  const deleteProject = useCallback(async (id: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete project");

      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete project";
      setError(message);
      throw err;
    }
  }, []);

  return {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    getProject,
    updateProject,
    deleteProject,
  };
}
