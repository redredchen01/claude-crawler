import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function AdminDashboardPage() {
  const session = await getAuthSession();

  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <main>
      <DashboardClient />
    </main>
  );
}
