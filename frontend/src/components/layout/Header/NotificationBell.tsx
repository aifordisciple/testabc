'use client';

import { Bell, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

interface NotificationBellProps {
  notifications?: Notification[];
  className?: string;
}

export function NotificationBell({ 
  notifications = [], 
  className = '' 
}: NotificationBellProps) {
  const [localNotifications, setLocalNotifications] = useState(notifications);
  const unreadCount = localNotifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setLocalNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setLocalNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px]",
              "flex items-center justify-center",
              "bg-destructive text-destructive-foreground text-xs font-bold",
              "rounded-full animate-pulse"
            )}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">通知</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              全部已读
            </button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {localNotifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              暂无通知
            </div>
          ) : (
            localNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => markAsRead(notification.id)}
                className={cn(
                  "px-4 py-3 cursor-pointer transition-colors",
                  "hover:bg-accent",
                  !notification.read && "bg-primary/5"
                )}
              >
                <div className="flex items-start gap-3">
                  {!notification.read && (
                    <span className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {notification.time}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
