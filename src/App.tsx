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
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import React, { Suspense } from "react";

// Lazy load all pages for faster initial load
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Inventory = React.lazy(() => import("./pages/Inventory"));
const Categories = React.lazy(() => import("./pages/Categories"));
const StockIn = React.lazy(() => import("./pages/StockIn"));
const StockOut = React.lazy(() => import("./pages/StockOut"));
const Suppliers = React.lazy(() => import("./pages/Suppliers"));
const Customers = React.lazy(() => import("./pages/Customers"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Auth = React.lazy(() => import("./pages/Auth"));
const POS = React.lazy(() => import("./pages/POS"));
const Loans = React.lazy(() => import("./pages/Loans"));
const Warehouses = React.lazy(() => import("./pages/Warehouses"));
const Support = React.lazy(() => import("./pages/Support"));
const Transactions = React.lazy(() => import("./pages/Transactions"));
const UserManagement = React.lazy(() => import("./pages/UserManagement"));
const OwnerDashboard = React.lazy(() => import("./pages/OwnerDashboard"));
const Expenses = React.lazy(() => import("./pages/Expenses"));
const Employees = React.lazy(() => import("./pages/Employees"));
const SalesHistory = React.lazy(() => import("./pages/SalesHistory"));
const StockAdjustment = React.lazy(() => import("./pages/StockAdjustment"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30s before refetch
      gcTime: 5 * 60 * 1000, // 5min cache
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
        <OfflineBanner />
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
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
