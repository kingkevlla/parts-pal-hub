import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const parts = [
  { id: 1, code: "BRK-001", name: "Brake Pads XJ40", category: "Brakes", brand: "AutoPro", stock: 150, price: 45.99, compatibility: "Toyota, Honda" },
  { id: 2, code: "OIL-045", name: "Oil Filter FT890", category: "Filters", brand: "FiltraTech", stock: 200, price: 12.50, compatibility: "Universal" },
  { id: 3, code: "AIR-200", name: "Air Filter AF2000", category: "Filters", brand: "FiltraTech", stock: 175, price: 18.75, compatibility: "Ford, Mazda" },
  { id: 4, code: "SPK-044", name: "Spark Plugs SP44", category: "Ignition", brand: "IgnitePlus", stock: 300, price: 8.25, compatibility: "Universal" },
  { id: 5, code: "BAT-120", name: "Car Battery 12V", category: "Electrical", brand: "PowerMax", stock: 50, price: 125.00, compatibility: "Universal" },
  { id: 6, code: "TIR-255", name: "Tire 255/45R18", category: "Tires", brand: "RoadGrip", stock: 80, price: 210.00, compatibility: "SUV, Sedan" },
];

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredParts = parts.filter(part =>
    part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">Manage all spare parts in stock</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add New Part
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Code</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Part Name</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Category</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Brand</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Stock</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Price</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Compatibility</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part) => (
                  <tr key={part.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="py-3 px-4 font-mono text-sm">{part.code}</td>
                    <td className="py-3 px-4 font-medium">{part.name}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary">{part.category}</Badge>
                    </td>
                    <td className="py-3 px-4 text-sm">{part.brand}</td>
                    <td className="py-3 px-4">
                      <span className={part.stock < 100 ? "font-medium text-warning" : ""}>
                        {part.stock}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium">${part.price}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{part.compatibility}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">Edit</Button>
                        <Button variant="ghost" size="sm">View</Button>
                      </div>
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
