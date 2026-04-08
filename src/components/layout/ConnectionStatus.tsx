import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function ConnectionStatus() {
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineSync();

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <Badge variant="outline" className="flex items-center gap-1 bg-green-500/10 text-green-600 border-green-500/30 text-xs px-2 py-0.5">
                  <Wifi className="h-3 w-3" />
                  Online
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30 text-xs px-2 py-0.5 animate-pulse">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isOnline 
              ? "Connected to server. All data is syncing normally."
              : "No internet connection. Changes are saved locally and will sync when you're back online."
            }
          </TooltipContent>
        </Tooltip>

        {pendingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={syncNow}
                disabled={!isOnline || isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CloudOff className="h-3 w-3 text-orange-500" />
                )}
                {pendingCount} pending
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSyncing 
                ? "Syncing changes..."
                : `${pendingCount} changes waiting to sync. ${isOnline ? 'Click to sync now.' : 'Will sync when online.'}`
              }
            </TooltipContent>
          </Tooltip>
        )}

        {isOnline && pendingCount === 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Cloud className="h-3.5 w-3.5 text-green-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>All changes synced</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
