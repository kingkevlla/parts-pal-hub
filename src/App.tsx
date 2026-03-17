import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Categories from "./pages/Categories";
import StockIn from "./pages/StockIn";
import StockOut from "./pages/StockOut";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import POS from "./pages/POS";
import Loans from "./pages/Loans";
import Warehouses from "./pages/Warehouses";
import Support from "./pages/Support";
import Transactions from "./pages/Transactions";
import UserManagement from "./pages/UserManagement";
import OwnerDashboard from "./pages/OwnerDashboard";
import Expenses from "./pages/Expenses";
import Employees from "./pages/Employees";
import SalesHistory from "./pages/SalesHistory";
import StockAdjustment from "./pages/StockAdjustment";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

/**
 * Route guard that checks if the user has the required permission.
 * If not, redirects to dashboard.
 */
const PermissionGuard = ({ permission, children }: { permission: string; children: React.ReactNode }) => {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const Layout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  </SidebarProvider>
);

const POSLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen w-full bg-background">
    <main className="h-screen overflow-y-auto">
      {children}
    </main>
  </div>
);

/** Helper: wrap a page in ProtectedRoute + Layout + PermissionGuard */
const ProtectedPage = ({ permission, children }: { permission: string; children: React.ReactNode }) => (
  <ProtectedRoute>
    <Layout>
      <PermissionGuard permission={permission}>
        {children}
      </PermissionGuard>
    </Layout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />

            {/* Dashboard - all authenticated users */}
            <Route path="/" element={<ProtectedPage permission="dashboard"><Dashboard /></ProtectedPage>} />

            {/* Owner dashboard - admin & owner only */}
            <Route path="/owner" element={<ProtectedPage permission="owner_dashboard"><OwnerDashboard /></ProtectedPage>} />

            {/* Sales */}
            <Route path="/pos" element={
              <ProtectedRoute>
                <PermissionGuard permission="pos">
                  <POSLayout><POS /></POSLayout>
                </PermissionGuard>
              </ProtectedRoute>
            } />
            <Route path="/sales-history" element={<ProtectedPage permission="sales_history"><SalesHistory /></ProtectedPage>} />
            <Route path="/transactions" element={<ProtectedPage permission="transactions"><Transactions /></ProtectedPage>} />

            {/* Inventory */}
            <Route path="/inventory" element={<ProtectedPage permission="inventory"><Inventory /></ProtectedPage>} />
            <Route path="/categories" element={<ProtectedPage permission="categories"><Categories /></ProtectedPage>} />
            <Route path="/stock-in" element={<ProtectedPage permission="stock_in"><StockIn /></ProtectedPage>} />
            <Route path="/stock-out" element={<ProtectedPage permission="stock_out"><StockOut /></ProtectedPage>} />
            <Route path="/stock-adjustment" element={<ProtectedPage permission="stock_adjustment"><StockAdjustment /></ProtectedPage>} />
            <Route path="/warehouses" element={<ProtectedPage permission="warehouses"><Warehouses /></ProtectedPage>} />

            {/* Finance */}
            <Route path="/loans" element={<ProtectedPage permission="loans"><Loans /></ProtectedPage>} />
            <Route path="/expenses" element={<ProtectedPage permission="expenses"><Expenses /></ProtectedPage>} />

            {/* People */}
            <Route path="/employees" element={<ProtectedPage permission="employees"><Employees /></ProtectedPage>} />
            <Route path="/suppliers" element={<ProtectedPage permission="suppliers"><Suppliers /></ProtectedPage>} />
            <Route path="/customers" element={<ProtectedPage permission="customers"><Customers /></ProtectedPage>} />

            {/* System */}
            <Route path="/reports" element={<ProtectedPage permission="reports"><Reports /></ProtectedPage>} />
            <Route path="/support" element={<ProtectedPage permission="support"><Support /></ProtectedPage>} />
            <Route path="/users" element={<ProtectedPage permission="users"><UserManagement /></ProtectedPage>} />
            <Route path="/settings" element={<ProtectedPage permission="settings"><Settings /></ProtectedPage>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
