import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AccessibleKpi } from "@/components/dashboard/AccessibleKpi";

interface StatCardProps {
  title: string;
  value: string | number;
  /**
   * Optional precise/full value to expose via tooltip + screen reader when
   * the visible `value` is compacted or may be visually truncated.
   */
  fullValue?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive: boolean;
  };
  variant?: "default" | "success" | "warning" | "destructive";
}

export function StatCard({ title, value, fullValue, icon: Icon, trend, variant = "default" }: StatCardProps) {
  const variantStyles = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };

  const display = String(value);

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <div className="text-3xl font-bold tabular-nums truncate">
              {fullValue ? (
                <AccessibleKpi compact={display} full={fullValue} />
              ) : (
                display
              )}
            </div>
            {trend && (
              <p className={cn("text-sm font-medium truncate", trend.positive ? "text-success" : "text-destructive")}>
                {trend.positive ? "+" : ""}{trend.value}
              </p>
            )}
          </div>
          <div className={cn("rounded-lg p-3 shrink-0", variantStyles[variant])}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
