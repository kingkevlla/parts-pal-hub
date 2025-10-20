import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Header() {
  return (
    <header className="flex h-16 items-center gap-4 border-b bg-card px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search parts, orders, customers..."
            className="pl-10"
          />
        </div>
      </div>
      <Button variant="ghost" size="icon">
        <Bell className="h-5 w-5" />
      </Button>
    </header>
  );
}
