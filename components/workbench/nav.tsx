"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import referenceJson from "@/data/reference/reference-sounds.json";
import { CATEGORIES } from "@/lib/audio/categories";
import {
  buildPool,
  type ApprovedPools,
  type Exclusions,
  type ReferenceData,
  type SlotOverrides,
} from "@/lib/audio/randomize";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  AudioWaveform,
  Boxes,
  ClipboardPaste,
  Copy,
  Dices,
  Layers,
  Hammer,
  Gem,
  ListChecks,
  Map,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type Item = {
  slug: string;
  label: string;
  // Draws a rule ABOVE this item. Used once, to separate the curated tabs from the
  // experimental ones: same group, because they are all "sounds", but they carry different
  // promises and that difference should be visible before you click.
  dividerBefore?: boolean;
  // Set for tabs that are already real routes rather than ?tab= views on the one page.
  route?: string;
  icon: React.ComponentType<{ className?: string }>;
  // Which product surface this tab feeds, shown trailing. The workbench-only engines below
  // the divider ship nothing directly; they fill the library.
  ships?: string;
};

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Sounds",
    items: [
      { slug: "review", label: "Library", icon: ListChecks, ships: "v1" },
      { slug: "variations", label: "Variations", icon: Layers, ships: "v1" },
      { slug: "creations", label: "Creations", icon: Boxes, ships: "v2" },
      { slug: "prospect", label: "Prospect", route: "/workbench/prospect", icon: Gem, ships: "experimental" },
      { slug: "craft", label: "Craft", dividerBefore: true, route: "/workbench/craft", icon: Hammer },
      { slug: "invent", label: "Invent", icon: Sparkles },
      { slug: "wild", label: "Wild", icon: Shuffle },
    ],
  },
  {
    label: "Tools",
    items: [
      { slug: "editor", label: "Editor", icon: Dices },
      { slug: "import", label: "Import", route: "/workbench/import", icon: ClipboardPaste },
      { slug: "dedupe", label: "Dedupe", icon: Copy },
      { slug: "calibrate", label: "Calibrate", icon: SlidersHorizontal },
      { slug: "atlas", label: "Atlas", icon: Map },
      { slug: "trash", label: "Trash", icon: Trash2 },
    ],
  },
];

// Step 1 of the sidebar migration: tabs are still one page driven by ?tab=, so
// "active" reads the query param everywhere except the atlas, which is already a
// real route. Both collapse to a pathname check once the routes are split.
const reference = referenceJson as unknown as ReferenceData;

// Sidebar counts. Library = distinct live sounds carrying at least one real category, so it
// answers "how big is my library" rather than summing the chips (a multi-category sound
// would be counted several times). To-sort and the ear-safety queue are deliberately NOT in
// it: neither is a member of anything yet. Trash is deleted plus duplicates.
function useLibraryCounts() {
  const [slots, setSlots] = useState<SlotOverrides>({});
  const [approved, setApproved] = useState<ApprovedPools>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<Exclusions>({});
  const [toSort, setToSort] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/slots").then((r) => r.json()).then(setSlots).catch(() => {});
    fetch("/api/pool").then((r) => r.json()).then(setApproved).catch(() => {});
    fetch("/api/deleted").then((r) => r.json()).then(setDeleted).catch(() => {});
    fetch("/api/duplicates").then((r) => r.json()).then(setDuplicates).catch(() => {});
    fetch("/api/exclusions").then((r) => r.json()).then(setExclusions).catch(() => {});
    fetch("/api/tosort").then((r) => r.json()).then(setToSort).catch(() => {});
  }, []);

  const pool = buildPool(reference, slots, approved, deleted, duplicates, exclusions, [], toSort);
  const real = new Set<string>(CATEGORIES);
  const members = pool.all.filter((s) => s.categories.some((c) => real.has(c)));
  // Two KINDS, never sources: a `pool/` id was generated here, anything else was imported as
  // seed data. The ratio is the one honest read on how much of the library is the project's
  // own output versus its training seeds.
  const generated = members.filter((s) => s.id.startsWith("pool/")).length;
  return { library: members.length, generated, imported: members.length - generated, trash: deleted.length + duplicates.length };
}

export function WorkbenchNav() {
  const counts = useLibraryCounts();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab") ?? "review";
  const onRoute = pathname !== "/workbench";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Back to the product"
              render={<Link href="/" />}
            >
              <AudioWaveform className="size-4" />
              <span className="flex-1 truncate font-semibold">Sound workbench</span>
              <ArrowUpRight className="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const route = item.slug === "atlas" ? "/workbench/atlas" : item.route;
                  const active = route ? pathname.startsWith(route) : !onRoute && tab === item.slug;
                  return (
                    <SidebarMenuItem key={item.slug} className={item.dividerBefore ? "mt-2 border-t border-sidebar-border pt-2" : undefined}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={
                          <Link
                            href={route ?? `/workbench?tab=${item.slug}`}
                          />
                        }
                      >
                        <item.icon className="size-4" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.ships && (
                          <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                            {item.ships}
                          </span>
                        )}
                        {(item.slug === "review" || item.slug === "trash") && (
                          <span
                            title={item.slug === "review" ? `${counts.generated} generated here, ${counts.imported} imported as seed data` : undefined}
                            className="font-mono text-[10px] tabular-nums text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            {item.slug === "review" ? counts.library : counts.trash}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
