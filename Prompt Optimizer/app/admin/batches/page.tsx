import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import BatchStatsCard from "@/app/components/admin/BatchStatsCard";
import BatchTimeline from "@/app/components/admin/BatchTimeline";
import BatchListWithDetail from "@/app/components/admin/BatchListWithDetail";
import AdminLayout from "@/app/components/admin/AdminLayout";

export const metadata = {
  title: "Batch Management | Prompt Optimizer Admin",
  description: "Monitor and manage batch processing jobs",
};

export default async function AdminBatchesPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "admin") {
    redirect("/auth/signin");
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Batch Management</h1>
          <p className="text-gray-600 mt-2">
            Monitor batch processing jobs, view performance metrics, and manage
            queue operations
          </p>
        </div>

        {/* Statistics Cards */}
        <section>
          <BatchStatsCard />
        </section>

        {/* Timeline Chart */}
        <section>
          <BatchTimeline hoursBack={24} />
        </section>

        {/* Batch List */}
        <section>
          <BatchListWithDetail />
        </section>
      </div>
    </AdminLayout>
  );
}
