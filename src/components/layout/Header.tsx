'use client';

import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
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
import { useState, useEffect } from 'react';
import type { Notification } from '@/types';
import { safeJson } from '@/lib/utils';

export function Header() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { setViewMode, sidebarCollapsed } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userImage, setUserImage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Fetch user image separately
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
      case 'info': return 'bg-blue-500';
      case 'warning': return 'bg-yellow-500';
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

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
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 flex h-14 md:h-[72px] items-center gap-2 sm:gap-4 border-b-0 bg-[#8b0000] dark:border-transparent dark:header-gradient px-4 lg:px-6 shrink-0 overflow-hidden'
    )}>
      {/* Logo for mobile */}
      <div className="flex items-center gap-2.5 md:hidden shrink-0 ml-1">
        <div className="bg-white rounded-lg p-1 shrink-0">
          <Image
            src="/tcu-logo.png"
            alt="TCU Logo"
            width={32}
            height={32}
            className="object-contain"
          />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm text-white leading-none tracking-wide">TCU</span>
          <span className="text-[9px] text-white/50 font-medium leading-none mt-0.5">Scheduling System</span>
        </div>
      </div>

      {/* Search bar — hidden on mobile */}
      <div className="hidden md:block w-full max-w-md">
        <div className="relative rounded-full bg-white/15 dark:bg-white/[0.08] border border-white/20 dark:border-white/[0.08] transition-all duration-300 focus-within:bg-white/20 dark:focus-within:bg-white/[0.12] focus-within:border-white/30 dark:focus-within:border-[#EF4444]/30 focus-within:shadow-[0_0_0_2px_rgba(239,68,68,0.2)]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60 dark:text-white/50" />
          <Input
            placeholder="Search schedules, faculty, rooms..."
            className="pl-10 h-10 bg-transparent border-0 text-white placeholder:text-white/60 dark:placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full text-sm"
          />
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Theme Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10 dark:hover:bg-white/[0.08] rounded-xl transition-all duration-200"
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </Button>
        )}

        {/* Notifications Dropdown */}
        <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 text-white/70 hover:text-white hover:bg-white/10 dark:hover:bg-white/[0.08] rounded-xl transition-all duration-200">
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 dark:bg-[#EF4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0 dark:bg-[#1E293B] dark:border-[#334155]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-[#334155]">
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
              <div className="max-h-[300px] overflow-y-auto premium-scrollbar">
                {notifications.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3 hover:bg-muted/50 dark:hover:bg-[#334155]/50 relative group cursor-pointer transition-colors ${
                      !n.read ? 'bg-muted/30 dark:bg-[#334155]/30' : ''
                    }`}
                    onClick={() => {
                      setNotificationsOpen(false);
                      setViewMode('notifications');
                    }}
                  >
                    <div className="relative mt-2 shrink-0">
                      <div className={`w-2 h-2 rounded-full ${getTypeColor(n.type)}`} />
                      {!n.read && (
                        <div className={`absolute inset-0 w-2 h-2 rounded-full ${getTypeColor(n.type)} animate-ping opacity-50`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pl-1">
                      {n.title && (
                        <p className="text-sm font-medium leading-tight truncate">{n.title}</p>
                      )}
                      <p className="text-sm leading-tight line-clamp-2">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>

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

            {notifications.length > 5 && (
              <>
                <DropdownMenuSeparator className="m-0 dark:bg-[#334155]" />
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
            <Button variant="ghost" className="relative h-9 w-9 rounded-xl text-white/70 hover:text-white hover:bg-white/10 dark:hover:bg-white/[0.08] transition-all duration-200 border border-white/40 hover:border-white/60 dark:hover:border-white/50">
              <Avatar className="h-8 w-8 ring-2 ring-white/20 dark:ring-white/10">
                <AvatarImage src={userImage || ''} alt={session?.user?.name || ''} />
                <AvatarFallback className="bg-white/15 dark:bg-white/10 text-white text-xs font-semibold">
                  {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 dark:bg-[#1E293B] dark:border-[#334155]" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{session?.user?.email}</p>
                <div className="pt-2">
                  <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="dark:bg-[#334155]" />
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
            <DropdownMenuSeparator className="dark:bg-[#334155]" />
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
