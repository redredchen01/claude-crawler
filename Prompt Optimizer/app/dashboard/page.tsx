import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function UserDashboardPage() {
  const session = await getAuthSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main>
      <DashboardClient />
    </main>
  );
}
