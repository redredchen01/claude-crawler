import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

export default function ProjectList() {
  const userId = "user-1"; // TODO: Get from auth context
  const [newProjectName, setNewProjectName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects", {
        headers: { "x-user-id": userId },
      });
      if (!response.ok) throw new Error("Failed to fetch projects");
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          name: newProjectName,
          siteName: newSiteName,
          locale: "en-US",
          language: "en",
          defaultEngine: "google",
        }),
      });
      if (!response.ok) throw new Error("Failed to create project");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewProjectName("");
      setNewSiteName("");
      setShowForm(false);
    },
  });

  const projects = projectsData?.projects || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName && newSiteName) {
      createMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Projects</h2>
          <p className="mt-2 text-gray-600">Manage your SEO content projects</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + New Project
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-lg shadow p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g., Blog SEO Research"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site Name
            </label>
            <input
              type="text"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              placeholder="e.g., myblog.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Project"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading projects...</p>
        </div>
      )}

      {!isLoading &&
        (projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600 mb-4">No projects yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">
                    Project Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">
                    Site Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">
                    Jobs
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((project: any) => (
                  <tr key={project.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {project.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {project.siteName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {project.jobCount || 0}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        to={`/projects/${project.id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
