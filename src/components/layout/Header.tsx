import { useState } from 'react';
import { Bell, LogOut, AlertTriangle, AlertCircle, Info, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function Header() {
  const { signOut, user } = useAuth();
  const { settings } = useSystemSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    notifications,
    unreadCount,
    alertCount,
    warningCount,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotifications();

  const getPageTitle = () => {
    const path = location.pathname;
    const titles: Record<string, string> = {
      '/': 'Dashboard',
      '/dashboard': 'Dashboard',
      '/pos': 'Point of Sale',
      '/inventory': 'Inventory',
      '/stock-in': 'Stock In',
      '/stock-out': 'Stock Out',
      '/categories': 'Categories',
      '/transactions': 'Transactions',
      '/customers': 'Customers',
      '/suppliers': 'Suppliers',
      '/loans': 'Loans',
      '/reports': 'Reports',
      '/warehouses': 'Warehouses',
      '/users': 'User Management',
      '/settings': 'Settings',
      '/support': 'Support',
      '/owner': 'Owner Dashboard',
    };
    return titles[path] || 'Dashboard';
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'alert':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const companyName = settings.company_name || 'Inventory System';

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6 shadow-sm">
      <SidebarTrigger className="md:hidden" />
      
      {/* Company Name & Page Title */}
      <div className="flex flex-col flex-1 min-w-0">
        <h1 className="text-lg font-bold truncate text-foreground">
          {companyName}
        </h1>
        <p className="text-xs text-muted-foreground truncate hidden sm:block">
          {getPageTitle()}
        </p>
      </div>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative shrink-0">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${alertCount > 0 ? 'bg-red-400' : 'bg-orange-400'}`} />
                <Badge 
                  variant="destructive" 
                  className={`relative h-5 min-w-5 flex items-center justify-center text-xs px-1 ${alertCount > 0 ? 'bg-red-500' : warningCount > 0 ? 'bg-orange-500' : 'bg-blue-500'}`}
                >
                  {unreadCount}
                </Badge>
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 bg-popover border shadow-lg">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notifications</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh} title="Refresh">
                <RefreshCw className="h-3 w-3" />
              </Button>
              {unreadCount > 0 && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={markAllAsRead} title="Mark all as read">
                  <Check className="h-3 w-3" />
                </Button>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ScrollArea className="h-[300px]">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer ${!notification.read ? 'bg-muted/50' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {notification.message}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-1" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User Menu */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border shadow-lg">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">Account</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
