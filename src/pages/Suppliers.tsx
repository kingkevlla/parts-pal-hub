import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const suppliers = [
  { 
    id: 1, 
    name: "AutoParts Co.", 
    contact: "John Smith", 
    email: "john@autoparts.com", 
    phone: "+1 (555) 123-4567",
    totalOrders: 45,
    status: "Active"
  },
  { 
    id: 2, 
    name: "FiltraTech Ltd.", 
    contact: "Sarah Johnson", 
    email: "sarah@filtratech.com", 
    phone: "+1 (555) 234-5678",
    totalOrders: 32,
    status: "Active"
  },
  { 
    id: 3, 
    name: "IgnitePlus Inc.", 
    contact: "Mike Davis", 
    email: "mike@igniteplus.com", 
    phone: "+1 (555) 345-6789",
    totalOrders: 28,
    status: "Active"
  },
  { 
    id: 4, 
    name: "PowerMax Supplies", 
    contact: "Emily Brown", 
    email: "emily@powermax.com", 
    phone: "+1 (555) 456-7890",
    totalOrders: 18,
    status: "Inactive"
  },
];

export default function Suppliers() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground">Manage your supplier relationships</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {suppliers.map((supplier) => (
          <Card key={supplier.id} className="transition-all hover:shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{supplier.name}</CardTitle>
                <Badge variant={supplier.status === "Active" ? "default" : "secondary"}>
                  {supplier.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium">Contact Person</p>
                <p className="text-sm text-muted-foreground">{supplier.contact}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{supplier.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{supplier.phone}</span>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  Total Orders: <span className="font-medium text-foreground">{supplier.totalOrders}</span>
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">Edit</Button>
                <Button variant="outline" size="sm" className="flex-1">View Orders</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
