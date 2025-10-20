import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const recentStockOut = [
  { id: 1, date: "2025-01-15", customer: "Mike's Garage", part: "Brake Pads XJ40", quantity: 4, unitPrice: 45.99, total: 183.96, status: "Completed" },
  { id: 2, date: "2025-01-15", customer: "AutoFix Workshop", part: "Oil Filter FT890", quantity: 10, unitPrice: 12.50, total: 125.00, status: "Pending" },
  { id: 3, date: "2025-01-14", customer: "Quick Repair", part: "Air Filter AF2000", quantity: 6, unitPrice: 18.75, total: 112.50, status: "Completed" },
  { id: 4, date: "2025-01-14", customer: "Pro Service Center", part: "Spark Plugs SP44", quantity: 12, unitPrice: 8.25, total: 99.00, status: "Completed" },
];

export default function StockOut() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stock Out</h1>
          <p className="text-muted-foreground">Record parts sold to customers and workshops</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Stock Out
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stock Out Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Part</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Quantity</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Unit Price</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Total</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentStockOut.map((transaction) => (
                  <tr key={transaction.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="py-3 px-4 text-sm">{transaction.date}</td>
                    <td className="py-3 px-4 font-medium">{transaction.customer}</td>
                    <td className="py-3 px-4">{transaction.part}</td>
                    <td className="py-3 px-4 text-destructive font-medium">-{transaction.quantity}</td>
                    <td className="py-3 px-4">${transaction.unitPrice.toFixed(2)}</td>
                    <td className="py-3 px-4 font-medium">${transaction.total.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <Badge variant={transaction.status === "Completed" ? "default" : "secondary"}>
                        {transaction.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Button variant="ghost" size="sm">View Details</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
