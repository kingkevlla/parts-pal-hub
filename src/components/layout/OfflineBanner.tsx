import { WifiOff, RefreshCw, Cloud, Clock } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineSync();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Track last sync time
  useEffect(() => {
    if (isOnline && !isSyncing && pendingCount === 0) {
      setLastSyncTime(new Date());
    }
  }, [isOnline, isSyncing, pendingCount]);

  // Update relative time display
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // Show nothing if online with no pending changes
  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${
        !isOnline
          ? 'bg-destructive/10 text-destructive border-b border-destructive/20'
          : isSyncing
          ? 'bg-primary/10 text-primary border-b border-primary/20'
          : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-b border-orange-500/20'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isOnline ? (
          <WifiOff className="h-4 w-4 shrink-0" />
        ) : isSyncing ? (
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Cloud className="h-4 w-4 shrink-0" />
        )}

        <span className="font-medium truncate">
          {!isOnline
            ? 'You are offline — changes are saved locally'
            : isSyncing
            ? 'Syncing offline changes…'
            : `${pendingCount} pending change${pendingCount !== 1 ? 's' : ''} to sync`}
        </span>

        {pendingCount > 0 && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {pendingCount}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTime(lastSyncTime)}
        </span>

        {isOnline && pendingCount > 0 && !isSyncing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={syncNow}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Sync now
          </Button>
        )}
      </div>
    </div>
  );
}
