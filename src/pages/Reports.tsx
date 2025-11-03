import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { DollarSign, Package, Users, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportData {
  totalSales: number;
  totalProducts: number;
  totalCustomers: number;
  totalSuppliers: number;
  totalIncome: number;
  totalExpenses: number;
  lowStockItems: number;
}

export default function Reports() {
  const [reportData, setReportData] = useState<ReportData>({
    totalSales: 0,
    totalProducts: 0,
    totalCustomers: 0,
    totalSuppliers: 0,
    totalIncome: 0,
    totalExpenses: 0,
    lowStockItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      // Fetch sales count
      const { count: salesCount } = await supabase
        .from("sales")
        .select("*", { count: "exact", head: true });

      // Fetch products count
      const { count: productsCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      // Fetch customers count
      const { count: customersCount } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });

      // Fetch suppliers count
      const { count: suppliersCount } = await supabase
        .from("suppliers")
        .select("*", { count: "exact", head: true });

      // Fetch transactions for income/expenses
      const { data: transactions } = await supabase.from("transactions").select("type, amount");

      const income = transactions
        ?.filter((t) => t.type === "income" || t.type === "sale")
        .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      const expenses = transactions
        ?.filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      // Fetch low stock items
      const { data: products } = await supabase.from("products").select("id, reorder_level");

      let lowStockCount = 0;
      if (products) {
        for (const product of products) {
          const { data: inventory } = await supabase
            .from("inventory")
            .select("quantity")
            .eq("product_id", product.id);

          const totalQuantity = inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
          if (totalQuantity <= (product.reorder_level || 10)) {
            lowStockCount++;
          }
        }
      }

      setReportData({
        totalSales: salesCount || 0,
        totalProducts: productsCount || 0,
        totalCustomers: customersCount || 0,
        totalSuppliers: suppliersCount || 0,
        totalIncome: income,
        totalExpenses: expenses,
        lowStockItems: lowStockCount,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const netProfit = reportData.totalIncome - reportData.totalExpenses;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Business insights and analytics</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading report data...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Sales"
              value={reportData.totalSales}
              icon={DollarSign}
            />
            <StatCard
              title="Total Products"
              value={reportData.totalProducts}
              icon={Package}
            />
            <StatCard
              title="Total Customers"
              value={reportData.totalCustomers}
              icon={Users}
            />
            <StatCard
              title="Total Suppliers"
              value={reportData.totalSuppliers}
              icon={Users}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${reportData.totalIncome.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${reportData.totalExpenses.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                <DollarSign className={`h-4 w-4 ${netProfit >= 0 ? "text-green-500" : "text-red-500"}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                  ${netProfit.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-500" />
                <span className="text-lg">
                  <span className="font-bold text-orange-500">{reportData.lowStockItems}</span> products are at or below reorder level
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
