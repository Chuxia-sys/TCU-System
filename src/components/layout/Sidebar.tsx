'use client';

import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useAppStore, type ViewMode } from '@/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Building2,
  BookOpen,
  DoorOpen,
  GraduationCap,
  Settings,
  Bell,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  UserCog,
  FileText,
  Shield,
  User,
  ClipboardCheck,
  MessageSquareWarning,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';

interface NavItem {
  id: ViewMode;
  label: string;
  icon: LucideIcon;
  roles: string[];
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'department_head', 'faculty'] },
  { id: 'calendar', label: 'Schedule Calendar', icon: Calendar, roles: ['admin', 'department_head', 'faculty'] },
  { id: 'schedules', label: 'Manage Schedules', icon: CalendarDays, roles: ['admin', 'department_head'] },
  { id: 'faculty', label: 'Faculty & Loads', icon: Users, roles: ['admin', 'department_head'] },
  { id: 'subjects', label: 'Subjects', icon: BookOpen, roles: ['admin', 'department_head'] },
  { id: 'rooms', label: 'Rooms', icon: DoorOpen, roles: ['admin', 'department_head'] },
  { id: 'sections', label: 'Sections', icon: GraduationCap, roles: ['admin', 'department_head'] },
  { id: 'departments', label: 'Departments', icon: Building2, roles: ['admin'] },
  { id: 'users', label: 'Users', icon: UserCog, roles: ['admin'] },
  { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle, roles: ['admin', 'department_head'] },
  { id: 'schedule-responses', label: 'Schedule Responses', icon: ClipboardCheck, roles: ['admin'] },
  { id: 'reports', label: 'Reports', icon: FileText, roles: ['admin', 'department_head'] },
];

const bottomNavItems: NavItem[] = [
  { id: 'preferences', label: 'My Preferences', icon: Settings, roles: ['faculty'] },
  { id: 'my-responses', label: 'My Schedule Responses', icon: MessageSquareWarning, roles: ['faculty'] },
  { id: 'notifications', label: 'Notifications', icon: Bell, roles: ['admin', 'department_head', 'faculty'] },
  { id: 'profile', label: 'Profile Settings', icon: User, roles: ['admin', 'department_head', 'faculty'] },
  { id: 'settings', label: 'System Settings', icon: Shield, roles: ['admin'] },
];

export function Sidebar() {
  const { data: session } = useSession();
  const { viewMode, setViewMode, sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  const userRole = session?.user?.role || '';
  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));
  const filteredBottomNavItems = bottomNavItems.filter(item => item.roles.includes(userRole));

  const handleNavClick = (id: ViewMode) => {
    setViewMode(id);
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out flex-col',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo - seamless with topbar, no border on right or bottom */}
        <div className={cn(
          "flex items-center bg-[#8B0000] border-b border-[#6B0000] shrink-0 h-16",
          sidebarCollapsed ? "justify-between px-2" : "gap-2 px-4"
        )}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="bg-white rounded-md p-1 shrink-0">
                <Image 
                  src="/tcu-logo.png" 
                  alt="TCU Logo" 
                  width={28} 
                  height={28}
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-bold text-white tracking-wide leading-none">TCU</h1>
                <p className="text-[9px] text-white/60 font-medium leading-none mt-0.5">Scheduling System</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="bg-white rounded-md p-1">
              <Image 
                src="/tcu-logo.png" 
                alt="TCU Logo" 
                width={24} 
                height={24}
                className="object-contain"
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/15 shrink-0"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Main Navigation - border-l and border-r only below the header */}
        <ScrollArea className="flex-1 py-4 border-r bg-card">
          <nav className="space-y-1 px-2">
            {!sidebarCollapsed && (
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Main Menu
              </p>
            )}
            {filteredNavItems.map((item) => {
              const isActive = viewMode === item.id;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleNavClick(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out',
                        isActive
                          ? 'bg-primary/15 text-primary dark:text-primary border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border-l-2 border-transparent',
                        sidebarCollapsed && 'justify-center px-2'
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                      {!sidebarCollapsed && item.badge && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right" className="font-medium">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {!sidebarCollapsed && filteredBottomNavItems.length > 0 && (
            <>
              <Separator className="my-4" />
              <nav className="space-y-1 px-2">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Account
                </p>
                {filteredBottomNavItems.map((item) => {
                  const isActive = viewMode === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out',
                        isActive
                          ? 'bg-primary/15 text-primary dark:text-primary border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border-l-2 border-transparent'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
