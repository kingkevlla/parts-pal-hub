import { StatCard } from "@/components/dashboard/StatCard";
import { Package, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  {
    title: "Total Parts",
    value: "2,847",
    icon: Package,
    trend: { value: "12% vs last month", positive: true },
    variant: "default" as const,
  },
  {
    title: "Stock In (This Month)",
    value: "1,254",
    icon: TrendingUp,
    trend: { value: "8% vs last month", positive: true },
    variant: "success" as const,
  },
  {
    title: "Stock Out (This Month)",
    value: "983",
    icon: TrendingDown,
    trend: { value: "3% vs last month", positive: false },
    variant: "default" as const,
  },
  {
    title: "Low Stock Items",
    value: "47",
    icon: AlertTriangle,
    variant: "warning" as const,
  },
  {
    title: "Monthly Revenue",
    value: "$45,231",
    icon: DollarSign,
    trend: { value: "15% vs last month", positive: true },
    variant: "success" as const,
  },
  {
    title: "Active Customers",
    value: "342",
    icon: Users,
    trend: { value: "5% vs last month", positive: true },
    variant: "default" as const,
  },
];

const recentActivity = [
  { id: 1, type: "Stock In", part: "Brake Pads - Model XJ40", quantity: 50, time: "2 hours ago" },
  { id: 2, type: "Stock Out", part: "Oil Filter - FT890", quantity: 25, time: "3 hours ago" },
  { id: 3, type: "Stock In", part: "Air Filter - AF2000", quantity: 100, time: "5 hours ago" },
  { id: 4, type: "Stock Out", part: "Spark Plugs - SP44", quantity: 40, time: "6 hours ago" },
];

const lowStockItems = [
  { id: 1, code: "BRK-001", name: "Brake Pads XJ40", current: 5, minimum: 20, category: "Brakes" },
  { id: 2, code: "OIL-045", name: "Oil Filter FT890", current: 8, minimum: 30, category: "Filters" },
  { id: 3, code: "AIR-200", name: "Air Filter AF2000", current: 12, minimum: 25, category: "Filters" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your spare parts inventory</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="font-medium">{activity.part}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.type}: {activity.quantity} units
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockItems.map((item) => (
                <div key={item.id} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.code} • {item.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-destructive font-medium">{item.current} units</span>
                    <span className="text-muted-foreground">/ Min: {item.minimum}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
