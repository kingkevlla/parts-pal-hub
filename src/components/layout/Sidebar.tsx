import { LayoutDashboard, Package, TrendingUp, TrendingDown, Users, Building2, FileText, Settings, ShoppingCart, DollarSign, Warehouse, LifeBuoy, Receipt, UserCog, FolderOpen, Crown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Owner", href: "/owner", icon: Crown },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Categories", href: "/categories", icon: FolderOpen },
  { name: "Stock In", href: "/stock-in", icon: TrendingUp },
  { name: "Stock Out", href: "/stock-out", icon: TrendingDown },
  { name: "POS", href: "/pos", icon: ShoppingCart },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Loans", href: "/loans", icon: DollarSign },
  { name: "Warehouses", href: "/warehouses", icon: Warehouse },
  { name: "Suppliers", href: "/suppliers", icon: Building2 },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Support", href: "/support", icon: LifeBuoy },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Users", href: "/users", icon: UserCog },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const collapsed = state === "collapsed";

  return (
    <SidebarComponent collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        {!collapsed && (
          <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Parts Manager
          </h1>
        )}
        {collapsed && (
          <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            PM
          </h1>
        )}
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <NavLink
                        to={item.href}
                        end
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.name}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </SidebarComponent>
  );
}
