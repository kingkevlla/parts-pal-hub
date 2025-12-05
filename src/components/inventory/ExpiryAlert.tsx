import { AlertTriangle, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExpiryAlertProps {
  expiryDate: string | null;
  alertDays?: number;
}

export function ExpiryAlert({ expiryDate, alertDays = 30 }: ExpiryAlertProps) {
  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    // Expired
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="destructive" className="gap-1 animate-pulse">
              <XCircle className="h-3 w-3" />
              Expired
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Expired {Math.abs(diffDays)} days ago</p>
            <p className="text-xs text-muted-foreground">Date: {expiry.toLocaleDateString()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (diffDays === 0) {
    // Expires today
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Today!
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Expires today!</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (diffDays <= alertDays) {
    // Expiring soon
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="gap-1 border-orange-500 text-orange-500">
              <Clock className="h-3 w-3" />
              {diffDays}d
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Expires in {diffDays} days</p>
            <p className="text-xs text-muted-foreground">Date: {expiry.toLocaleDateString()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Not expiring soon - show date only
  return (
    <span className="text-sm text-muted-foreground">
      {expiry.toLocaleDateString()}
    </span>
  );
}

export function getExpiryStatus(expiryDate: string | null, alertDays = 30): 'expired' | 'warning' | 'ok' | null {
  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= alertDays) return 'warning';
  return 'ok';
}
