import { Suspense } from "react";
import { WorkbenchNav } from "@/components/workbench/nav";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="min-w-0">
      <Suspense>
        <WorkbenchNav />
      </Suspense>
      {/* min-w-0: flex children default to min-width:auto, so a wide table would push the
          inset past the viewport instead of scrolling inside its own overflow container. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
