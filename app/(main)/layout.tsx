import  NavigationSidebar  from "@/components/navigation/navigation-sidebar";
import { currentProfile } from "@/lib/current-profile";
import { DEMO_USER_ID } from "@/lib/demo";
import { DemoBanner, DemoProvider } from "@/components/provider/demo-provider";
import { WorkspaceSync } from "@/components/provider/workspace-sync";

const MainLayout = async ({
  children
}: {
  children: React.ReactNode;
}) => {
  const profile = await currentProfile();
  return ( 
    <DemoProvider isDemo={profile?.userId === DEMO_USER_ID}>
    <WorkspaceSync />
    <div className="workspace-shell relative isolate flex h-full overflow-hidden">
      <div className="relative z-30 flex h-full w-[80px] shrink-0 flex-col max-md:hidden">
        <NavigationSidebar />
      </div>
      <main className="relative z-10 flex h-full min-w-0 flex-1 flex-col">
        <DemoBanner />
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
    </DemoProvider>
   );
}
 
export default MainLayout;
