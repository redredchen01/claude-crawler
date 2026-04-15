import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const userId = "user-1"; // TODO: Get from auth context

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

  const projects = projectsData?.projects || [];
  const projectCount = projects.length;
  const jobCount = projects.reduce(
    (sum: number, p: any) => sum + (p.jobCount || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-2 text-gray-600">Welcome to SEO Content System</p>
      </div>

      {isLoading && (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading projects...</p>
        </div>
      )}

      {!isLoading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-2xl font-bold text-gray-900">
                {projectCount}
              </div>
              <div className="text-gray-600">Projects</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-2xl font-bold text-gray-900">—</div>
              <div className="text-gray-600">Keywords</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-2xl font-bold text-gray-900">{jobCount}</div>
              <div className="text-gray-600">Jobs</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-2xl font-bold text-gray-900">—</div>
              <div className="text-gray-600">Clusters</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Recent Projects
              </h3>
              <Link
                to="/projects"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                View All →
              </Link>
            </div>

            {projects.length === 0 ? (
              <p className="text-gray-600 py-4">
                No projects yet.{" "}
                <Link
                  to="/projects"
                  className="text-blue-600 hover:text-blue-700"
                >
                  Create one
                </Link>
              </p>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((project: any) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="block p-4 border border-gray-200 rounded hover:border-blue-500 hover:shadow transition"
                  >
                    <h4 className="font-semibold text-gray-900">
                      {project.name}
                    </h4>
                    <p className="text-sm text-gray-600">{project.siteName}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
