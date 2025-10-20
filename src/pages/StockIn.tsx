import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

const recentStockIn = [
  { id: 1, date: "2025-01-15", supplier: "AutoParts Co.", part: "Brake Pads XJ40", quantity: 50, unitPrice: 40.00, total: 2000.00 },
  { id: 2, date: "2025-01-14", supplier: "FiltraTech Ltd.", part: "Oil Filter FT890", quantity: 100, unitPrice: 10.00, total: 1000.00 },
  { id: 3, date: "2025-01-13", supplier: "AutoParts Co.", part: "Air Filter AF2000", quantity: 75, unitPrice: 15.00, total: 1125.00 },
  { id: 4, date: "2025-01-12", supplier: "IgnitePlus Inc.", part: "Spark Plugs SP44", quantity: 200, unitPrice: 6.50, total: 1300.00 },
];

export default function StockIn() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stock In</h1>
          <p className="text-muted-foreground">Record incoming inventory from suppliers</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Stock In
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stock In Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Supplier</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Part</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Quantity</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Unit Price</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Total</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentStockIn.map((transaction) => (
                  <tr key={transaction.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="py-3 px-4 text-sm">{transaction.date}</td>
                    <td className="py-3 px-4 font-medium">{transaction.supplier}</td>
                    <td className="py-3 px-4">{transaction.part}</td>
                    <td className="py-3 px-4 text-success font-medium">+{transaction.quantity}</td>
                    <td className="py-3 px-4">${transaction.unitPrice.toFixed(2)}</td>
                    <td className="py-3 px-4 font-medium">${transaction.total.toFixed(2)}</td>
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
