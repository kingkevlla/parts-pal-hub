import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  type: 'warning' | 'alert' | 'info';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: Date;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const notifs: Notification[] = [];
      const today = new Date().toISOString().split('T')[0];

      // Offline-first reads from the local SQLite store
      const [productsRes, inventoryRes, loansRes] = await Promise.all([
        offlineQuery<any>('products', () => supabase.from('products').select('*')),
        offlineQuery<any>('inventory', () => supabase.from('inventory').select('*')),
        offlineQuery<any>('loans', () => supabase.from('loans').select('*')),
      ]);

      const products = productsRes.data || [];
      const inventory = inventoryRes.data || [];
      const loans = loansRes.data || [];

      // Expired products
      products
        .filter((p: any) => p.expiry_date && p.expiry_date < today)
        .forEach((p: any) => {
          notifs.push({
            id: `expired-${p.id}`,
            type: 'alert',
            title: 'Product Expired',
            message: `${p.name} has expired`,
            link: '/inventory',
            read: false,
            createdAt: new Date(),
          });
        });

      // Expiring soon (within 30 days)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureStr = futureDate.toISOString().split('T')[0];
      const expiringProducts = products.filter(
        (p: any) => p.expiry_date && p.expiry_date >= today && p.expiry_date <= futureStr
      );

      if (expiringProducts.length > 0) {
        notifs.push({
          id: 'expiring-soon',
          type: 'warning',
          title: 'Products Expiring Soon',
          message: `${expiringProducts.length} product(s) expiring within 30 days`,
          link: '/inventory',
          read: false,
          createdAt: new Date(),
        });
      }

      // Low stock — aggregate inventory per product locally
      const qtyByProduct = new Map<string, number>();
      inventory.forEach((inv: any) => {
        qtyByProduct.set(inv.product_id, (qtyByProduct.get(inv.product_id) || 0) + (inv.quantity || 0));
      });
      const lowStockCount = products.filter(
        (p: any) => (qtyByProduct.get(p.id) || 0) <= (p.min_stock_level || 0)
      ).length;

      if (lowStockCount > 0) {
        notifs.push({
          id: 'low-stock',
          type: 'warning',
          title: 'Low Stock Alert',
          message: `${lowStockCount} product(s) are below minimum stock level`,
          link: '/inventory',
          read: false,
          createdAt: new Date(),
        });
      }

      // Active loans
      const activeLoans = loans.filter((l: any) => ['pending', 'active'].includes(l.status));
      if (activeLoans.length > 0) {
        notifs.push({
          id: 'pending-loans',
          type: 'info',
          title: 'Active Loans',
          message: `${activeLoans.length} loan(s) are currently active`,
          link: '/loans',
          read: false,
          createdAt: new Date(),
        });
      }

      // Overdue loans
      const overdueLoans = activeLoans.filter((l: any) => l.due_date && l.due_date < today);
      if (overdueLoans.length > 0) {
        notifs.push({
          id: 'overdue-loans',
          type: 'alert',
          title: 'Overdue Loans',
          message: `${overdueLoans.length} loan(s) are past due date`,
          link: '/loans',
          read: false,
          createdAt: new Date(),
        });
      }

      // Open support tickets (online only — not part of the offline store)
      if (navigator.onLine) {
        try {
          const { data: openTickets } = await supabase
            .from('support_tickets' as any)
            .select('id')
            .eq('status', 'open');

          if (openTickets && openTickets.length > 0) {
            notifs.push({
              id: 'open-tickets',
              type: 'info',
              title: 'Open Tickets',
              message: `${openTickets.length} support ticket(s) need attention`,
              link: '/support',
              read: false,
              createdAt: new Date(),
            });
          }
        } catch { /* ignore */ }
      }


      setNotifications(notifs);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const alertCount = notifications.filter(n => n.type === 'alert').length;
  const warningCount = notifications.filter(n => n.type === 'warning').length;

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return {
    notifications,
    loading,
    unreadCount,
    alertCount,
    warningCount,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
