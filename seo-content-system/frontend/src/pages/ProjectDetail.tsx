import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useJobs, useCreateJob } from "../hooks/useJobs";

export default function ProjectDetail() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = "user-1"; // TODO: Get from auth context
  const queryClient = useQueryClient();

  const [seedKeywords, setSeedKeywords] = useState("");

  if (!projectId) {
    return (
      <div className="text-red-600">
        Invalid project ID
      </div>
    );
  }

  // Fetch project info
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: { "x-user-id": userId },
      });
      if (!response.ok) throw new Error("Failed to fetch project");
      return response.json();
    },
  });

  // Fetch jobs for project
  const { data: jobsData, isLoading: jobsLoading } = useJobs(projectId);

  // Create job mutation
  const createJobMutation = useCreateJob();

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedKeywords.trim()) return;

    const keywords = seedKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);

    createJobMutation.mutate(
      {
        projectId,
        seedKeywords: keywords,
      },
      {
        onSuccess: () => {
          setSeedKeywords("");
        },
      }
    );
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-gray-100 text-gray-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const project = projectData?.project;
  const jobs = jobsData || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/projects")}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          ← Back to Projects
        </button>
      </div>

      {projectLoading ? (
        <div className="text-gray-500">Loading project...</div>
      ) : project ? (
        <>
          {/* Project Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Site Name</p>
                <p className="font-medium">{project.siteName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Locale</p>
                <p className="font-medium">{project.locale}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Language</p>
                <p className="font-medium">{project.language}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Default Engine</p>
                <p className="font-medium">{project.defaultEngine}</p>
              </div>
            </div>
          </div>

          {/* Create Job Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Create New Job
            </h2>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seed Keywords (one per line)
                </label>
                <textarea
                  value={seedKeywords}
                  onChange={(e) => setSeedKeywords(e.target.value)}
                  placeholder="react&#10;typescript&#10;node.js"
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={createJobMutation.isPending || !seedKeywords.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {createJobMutation.isPending ? "Creating..." : "Create Job"}
              </button>
            </form>
          </div>

          {/* Jobs List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Recent Jobs ({jobs.length})
            </h2>

            {jobsLoading ? (
              <div className="text-gray-500">Loading jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No jobs yet. Create one to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Job ID
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Keywords
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Candidates
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Progress
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.jobId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                          {job.jobId.substring(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                              job.status
                            )}`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {job.seedKeywords.join(", ")}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {job.totalCandidates}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {job.status === "processing" ? (
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{
                                    width: `${
                                      job.totalCandidates > 0
                                        ? (job.processedCount /
                                            job.totalCandidates) *
                                          100
                                        : 0
                                    }%`,
                                  }}
                                ></div>
                              </div>
                              <span className="text-xs whitespace-nowrap">
                                {job.processedCount}/{job.totalCandidates}
                              </span>
                            </div>
                          ) : (
                            <span>
                              {job.processedCount}/{job.totalCandidates}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm space-x-2">
                          <button
                            onClick={() =>
                              navigate(`/projects/${projectId}/jobs/${job.jobId}`)
                            }
                            className="text-blue-600 hover:text-blue-800"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-red-600">Project not found</div>
      )}
    </div>
  );
}
