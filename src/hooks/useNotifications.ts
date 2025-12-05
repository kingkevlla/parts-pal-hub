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

      // Check for expired products
      const { data: expiredProducts } = await supabase
        .from('products')
        .select('id, name, expiry_date')
        .not('expiry_date', 'is', null)
        .lt('expiry_date', new Date().toISOString().split('T')[0]);

      expiredProducts?.forEach(p => {
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

      // Check for expiring soon (within 30 days)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const { data: expiringProducts } = await supabase
        .from('products')
        .select('id, name, expiry_date')
        .not('expiry_date', 'is', null)
        .gte('expiry_date', new Date().toISOString().split('T')[0])
        .lte('expiry_date', futureDate.toISOString().split('T')[0]);

      if (expiringProducts && expiringProducts.length > 0) {
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

      // Check for low stock products
      const { data: products } = await supabase
        .from('products')
        .select('id, name, min_stock_level');

      let lowStockCount = 0;
      if (products) {
        for (const product of products) {
          const { data: inventory } = await supabase
            .from('inventory')
            .select('quantity')
            .eq('product_id', product.id);

          const totalQty = inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
          if (totalQty <= (product.min_stock_level || 0)) {
            lowStockCount++;
          }
        }
      }

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

      // Check for pending loans
      const { data: pendingLoans } = await supabase
        .from('loans')
        .select('id')
        .in('status', ['pending', 'active']);

      if (pendingLoans && pendingLoans.length > 0) {
        notifs.push({
          id: 'pending-loans',
          type: 'info',
          title: 'Active Loans',
          message: `${pendingLoans.length} loan(s) are currently active`,
          link: '/loans',
          read: false,
          createdAt: new Date(),
        });
      }

      // Check for overdue loans
      const { data: overdueLoans } = await supabase
        .from('loans')
        .select('id')
        .in('status', ['pending', 'active'])
        .lt('due_date', new Date().toISOString().split('T')[0]);

      if (overdueLoans && overdueLoans.length > 0) {
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

      // Check for open support tickets
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
