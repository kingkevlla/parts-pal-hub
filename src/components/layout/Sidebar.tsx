import {
  LayoutDashboard, Package, TrendingUp, TrendingDown, Users, Building2,
  FileText, Settings, ShoppingCart, DollarSign, Warehouse, LifeBuoy,
  Receipt, UserCog, FolderOpen, Crown, CreditCard, UsersRound,
  History, ClipboardEdit,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@/components/ui/skeleton";

interface NavItem {
  name: string;
  href: string;
  icon: any;
  permission: string;
  group: string;
}

const navigation: NavItem[] = [
  // General
  { name: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard", group: "General" },
  { name: "Owner", href: "/owner", icon: Crown, permission: "owner_dashboard", group: "General" },

  // Sales
  { name: "POS", href: "/pos", icon: ShoppingCart, permission: "pos", group: "Sales" },
  { name: "Sales History", href: "/sales-history", icon: History, permission: "sales_history", group: "Sales" },
  { name: "Transactions", href: "/transactions", icon: Receipt, permission: "transactions", group: "Sales" },

  // Inventory
  { name: "Inventory", href: "/inventory", icon: Package, permission: "inventory", group: "Inventory" },
  { name: "Categories", href: "/categories", icon: FolderOpen, permission: "categories", group: "Inventory" },
  { name: "Stock In", href: "/stock-in", icon: TrendingUp, permission: "stock_in", group: "Inventory" },
  { name: "Stock Out", href: "/stock-out", icon: TrendingDown, permission: "stock_out", group: "Inventory" },
  { name: "Stock Adjust", href: "/stock-adjustment", icon: ClipboardEdit, permission: "stock_adjustment", group: "Inventory" },
  { name: "Warehouses", href: "/warehouses", icon: Warehouse, permission: "warehouses", group: "Inventory" },

  // Finance
  { name: "Loans", href: "/loans", icon: DollarSign, permission: "loans", group: "Finance" },
  { name: "Expenses", href: "/expenses", icon: CreditCard, permission: "expenses", group: "Finance" },

  // People
  { name: "Employees", href: "/employees", icon: UsersRound, permission: "employees", group: "People" },
  { name: "Suppliers", href: "/suppliers", icon: Building2, permission: "suppliers", group: "People" },
  { name: "Customers", href: "/customers", icon: Users, permission: "customers", group: "People" },

  // System
  { name: "Reports", href: "/reports", icon: FileText, permission: "reports", group: "System" },
  { name: "Support", href: "/support", icon: LifeBuoy, permission: "support", group: "System" },
  { name: "Users", href: "/users", icon: UserCog, permission: "users", group: "System" },
  { name: "Settings", href: "/settings", icon: Settings, permission: "settings", group: "System" },
];

export function Sidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const collapsed = state === "collapsed";
  const { hasPermission, loading } = usePermissions();

  // Filter navigation items based on user permissions
  const allowedNavigation = navigation.filter((item) => hasPermission(item.permission));

  // Group allowed items
  const groupedNav = allowedNavigation.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  // Maintain group order
  const groupOrder = ["General", "Sales", "Inventory", "Finance", "People", "System"];

  return (
    <SidebarComponent collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        {!collapsed ? (
          <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Parts Manager
          </h1>
        ) : (
          <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            PM
          </h1>
        )}
      </div>
      <SidebarContent>
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          groupOrder
            .filter((group) => groupedNav[group]?.length > 0)
            .map((group) => (
              <SidebarGroup key={group}>
                {!collapsed && (
                  <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                    {group}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {groupedNav[group].map((item) => {
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
            ))
        )}
      </SidebarContent>
    </SidebarComponent>
  );
}
