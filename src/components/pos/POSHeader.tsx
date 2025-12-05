import { useState, useEffect } from 'react';
import { ShoppingCart, Home, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';

interface POSHeaderProps {
  cartItemCount: number;
  cartTotal: number;
  onRefresh: () => void;
}

export default function POSHeader({ cartItemCount, cartTotal, onRefresh }: POSHeaderProps) {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState('POS System');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const fetchCompanyName = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'company_name')
        .maybeSingle();
      if (data?.value) {
        setCompanyName(String(data.value));
      }
    };
    fetchCompanyName();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
  };

  const handleHomeClick = () => {
    if (hasPermission('dashboard')) {
      navigate('/dashboard');
    } else {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access the admin panel.',
        variant: 'destructive',
      });
    }
  };

  return (
    <header className="bg-primary text-primary-foreground px-4 py-2 shadow-lg">
      <div className="flex items-center justify-between">
        {/* Left - System Name */}
        <div className="flex items-center gap-3">
          <div className="bg-primary-foreground/10 p-2 rounded-lg">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{companyName}</h1>
            <p className="text-xs text-primary-foreground/70">Point of Sale</p>
          </div>
        </div>

        {/* Center - Sale Summary */}
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-2 bg-primary-foreground/10 px-4 py-2 rounded-lg">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-sm font-medium">Cart:</span>
            <Badge variant="secondary" className="bg-primary-foreground text-primary">
              {cartItemCount} items
            </Badge>
          </div>
          <div className="flex items-center gap-2 bg-primary-foreground/10 px-4 py-2 rounded-lg">
            <span className="text-sm font-medium">Total:</span>
            <span className="text-lg font-bold">{formatAmount(cartTotal)}</span>
          </div>
        </div>

        {/* Right - Quick Actions & Time */}
        <div className="flex items-center gap-2">
          {/* Date/Time */}
          <div className="hidden sm:flex items-center gap-2 text-primary-foreground/80 text-sm mr-2">
            <Clock className="h-4 w-4" />
            <span>{formatDate(currentTime)}</span>
            <span className="font-mono">{formatTime(currentTime)}</span>
          </div>

          {/* Quick Actions */}
          <Button 
            variant="ghost" 
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={handleHomeClick}
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile Sale Summary */}
      <div className="flex md:hidden items-center justify-between mt-2 pt-2 border-t border-primary-foreground/20">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          <Badge variant="secondary" className="bg-primary-foreground text-primary">
            {cartItemCount} items
          </Badge>
        </div>
        <span className="font-bold">{formatAmount(cartTotal)}</span>
      </div>
    </header>
  );
}
