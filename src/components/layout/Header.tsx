'use client';

import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bell,
  Search,
  Sun,
  Moon,
  Settings,
  LogOut,
  User,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useAppStore } from '@/store';
import { useState, useEffect } from 'react';
import type { Notification } from '@/types';
import { safeJson } from '@/lib/utils';

export function Header() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { setViewMode } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userImage, setUserImage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Fetch user image separately (not stored in JWT to prevent token size issues)
  useEffect(() => {
    const fetchUserImage = async () => {
      if (!session?.user?.id) return;
      try {
        const res = await fetch(`/api/users/${session.user.id}`);
        const data = await safeJson<{ image?: string }>(res);
        if (data) setUserImage(data.image ?? null);
      } catch (error) {
        console.error('Error fetching user image:', error);
      }
    };
    
    fetchUserImage();
  }, [session?.user?.id]);

  // Fetch notifications on mount and when session changes
  const sessionId = session?.user?.id;
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();

    const doFetch = async (signal: AbortSignal) => {
      try {
        const res = await fetch(`/api/notifications?userId=${sessionId}`, { signal });
        const data = await safeJson<Notification[]>(res);
        if (!signal.aborted) {
          setNotifications(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!signal.aborted) {
          setNotifications([]);
        }
      }
    };

    doFetch(controller.signal);
    const interval = setInterval(() => doFetch(controller.signal), 60000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [sessionId]);

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true, userId: session?.user?.id }),
      });
      // Optimistically mark all as read locally
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  // Delete single notification
  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  // Get notification type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info':
        return 'bg-blue-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Calculate unread count (with safety check)
  const unreadCount = Array.isArray(notifications) ? notifications.filter((n) => !n.read).length : 0;

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      admin: { label: 'Admin', variant: 'default' },
      department_head: { label: 'Dept Head', variant: 'secondary' },
      faculty: { label: 'Faculty', variant: 'outline' },
    };
    return badges[role] || { label: role, variant: 'outline' };
  };

  const roleBadge = getRoleBadge(session?.user?.role || '');

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.reload();
  };

  // Format relative time
  const formatRelativeTime = (date: Date | string) => {
    const now = new Date();
    const notificationDate = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - notificationDate.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return notificationDate.toLocaleDateString();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-16 items-center gap-2 sm:gap-4 border-b border-[#6B0000] bg-[#8B0000] px-4 lg:px-6 shrink-0">
      {/* Logo for mobile - only shows on mobile since sidebar is hidden */}
      <div className="flex items-center gap-2 md:hidden shrink-0">
        <div className="bg-white rounded-lg p-1">
          <Image 
            src="/tcu-logo.png" 
            alt="TCU Logo" 
            width={36} 
            height={36}
            className="object-contain"
          />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm text-white leading-none">TCU</span>
          <span className="text-[9px] text-white/60 font-medium leading-none mt-0.5">Scheduling System</span>
        </div>
      </div>

      {/* Search - hidden on mobile */}
      <div className="hidden md:block w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          <Input
            placeholder="Search schedules, faculty, rooms..."
            className="pl-10 h-9 bg-white/15 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20 focus:border-white/40 rounded-lg"
          />
        </div>
      </div>

      {/* Spacer to push actions to the right */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Theme Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/15"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        )}

        {/* Notifications Dropdown */}
        <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 text-white/80 hover:text-white hover:bg-white/15">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 text-amber-900 text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary hover:text-primary"
                  onClick={handleMarkAllRead}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Mark All as Read
                </Button>
              )}
            </div>

            {/* Notification List */}
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3 hover:bg-muted/50 relative group cursor-pointer ${
                      !n.read ? 'bg-muted/30' : ''
                    }`}
                    onClick={() => {
                      setNotificationsOpen(false);
                      setViewMode('notifications');
                    }}
                  >
                    {/* Type indicator dot with unread ring */}
                    <div className="relative mt-2 shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${getTypeColor(n.type)}`}
                      />
                      {!n.read && (
                        <div className={`absolute inset-0 w-2 h-2 rounded-full ${getTypeColor(n.type)} animate-ping opacity-50`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pl-1">
                      {n.title && (
                        <p className="text-sm font-medium leading-tight truncate">{n.title}</p>
                      )}
                      <p className="text-sm leading-tight line-clamp-2">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>

                    {/* Delete button (visible on hover) */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteNotification(n.id, e)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* View All Link */}
            {notifications.length > 5 && (
              <>
                <DropdownMenuSeparator className="m-0" />
                <DropdownMenuItem
                  className="justify-center text-primary cursor-pointer"
                  onClick={() => {
                    setNotificationsOpen(false);
                    setViewMode('notifications');
                  }}
                >
                  View all {notifications.length} notifications
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full text-white/80 hover:text-white hover:bg-white/15">
              <Avatar className="h-8 w-8 ring-2 ring-white/30">
                <AvatarImage src={userImage || ''} alt={session?.user?.name || ''} />
                <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">
                  {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{session?.user?.email}</p>
                <div className="pt-2">
                  <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setViewMode('profile')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            {session?.user?.role === 'admin' && (
              <DropdownMenuItem onClick={() => setViewMode('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
