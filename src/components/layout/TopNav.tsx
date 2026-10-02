import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { navigation, NavItem } from "@/components/layout/Sidebar";
import { usePermissions } from "@/hooks/usePermissions";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useAppConfig } from "@/lib/appConfig";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GROUPS = ["General", "Sales", "Inventory", "Finance", "People", "System"];

export function TopNav() {
  const { hasPermission } = usePermissions();
  const { settings } = useSystemSettings();
  const config = useAppConfig();
  const { pathname } = useLocation();
  const grouped = navigation.filter((i) => hasPermission(i.permission)).reduce((acc, i) => {
    (acc[i.group] ||= []).push(i);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <nav className="flex h-14 items-center gap-2 overflow-x-auto border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
      <div className="mr-4 flex shrink-0 items-center gap-2">
        {config.theme.logo_url && <img src={config.theme.logo_url} alt="" className="h-7 w-7 rounded object-contain" />}
        <span className="font-bold">{settings.company_name || "Parts Manager"}</span>
      </div>
      {GROUPS.filter((g) => grouped[g]?.length).map((g) => {
        const items = grouped[g];
        const active = items.some((i) => i.href === pathname);
        return (
          <DropdownMenu key={g}>
            <DropdownMenuTrigger
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-sidebar-accent",
                active && "bg-sidebar-primary text-sidebar-primary-foreground",
              )}
            >
              {g} <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {items.map((i) => (
                <DropdownMenuItem key={i.href} asChild>
                  <NavLink to={i.href} className="flex items-center gap-2">
                    <i.icon className="h-4 w-4" /> {i.name}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
