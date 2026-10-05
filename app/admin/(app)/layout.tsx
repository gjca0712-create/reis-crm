import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getSession, getSessionFeatures } from "@/lib/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SIDEBAR_COOKIE } from "@/components/layout/nav-items";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  // Middleware already guarantees a session for every route under this group;
  // this only guards the edge case of a token expiring mid-request.
  if (!session) {
    return null;
  }

  const features = await getSessionFeatures(session);
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar features={features} collapsed={sidebarCollapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar session={session} features={features} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
