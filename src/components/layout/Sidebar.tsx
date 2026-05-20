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
  CalendarDays,
  UserCog,
  FileText,
  Shield,
  User,
  ClipboardCheck,
  MessageSquareWarning,
  Menu,
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

/* ── Shared nav button for both sections & both states ── */
function NavButton({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const btn = (
    <button
      onClick={onClick}
      aria-label={item.label}
      className={cn(
        'flex w-full items-center rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ease-in-out',
        // Expanded layout
        !collapsed && 'gap-3 px-3 py-2.5',
        // Collapsed layout — centered square button
        collapsed && 'justify-center p-2.5 mx-auto w-10 h-10',
        // Active / inactive styling
        isActive
          ? collapsed
            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
            : 'bg-primary/15 text-primary dark:text-primary border-l-2 border-primary'
          : collapsed
            ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border-l-2 border-transparent'
      )}
    >
      <Icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-5 w-5')} />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
          {item.badge}
        </span>
      )}
      {/* Badge dot in collapsed mode */}
      {collapsed && item.badge && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">{btn}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium" sideOffset={8}>
          {item.label}
          {item.badge && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
              {item.badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return btn;
}

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
      {/* Desktop Sidebar — hidden on mobile */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out flex-col overflow-hidden',
          sidebarCollapsed ? 'w-16' : 'w-56'
        )}
      >
        {/* ── Header: Logo + Burger ── */}
        <div
          className={cn(
            'flex items-center shrink-0 bg-[#8B0000] border-b border-[#6B0000] h-16',
            sidebarCollapsed ? 'justify-center gap-1' : 'gap-2 px-3'
          )}
        >
          {/* Expanded logo + text */}
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="bg-white rounded-lg p-1 shrink-0">
                <Image src="/tcu-logo.png" alt="TCU Logo" width={36} height={36} className="object-contain" />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-bold text-white tracking-wide leading-none">TCU</h1>
                <p className="text-[9px] text-white/60 font-medium leading-none mt-0.5">Scheduling System</p>
              </div>
            </div>
          )}

          {/* Expanded burger */}
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/15 shrink-0"
              aria-label="Collapse sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Collapsed: logo + burger side by side */}
          {sidebarCollapsed && (
            <>
              <div className="bg-white rounded-lg p-0.5 shrink-0 ml-[15px]">
                <Image src="/tcu-logo.png" alt="TCU Logo" width={28} height={28} className="object-contain" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/15 shrink-0"
                aria-label="Expand sidebar"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* ── Scrollable Navigation Area ── */}
        <ScrollArea className="flex-1 bg-card premium-scrollbar overflow-x-hidden">
          <div className="py-4">
            {/* Section heading — hidden when collapsed */}
            {!sidebarCollapsed && filteredNavItems.length > 0 && (
              <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Main Menu
              </p>
            )}

            {/* Main nav items */}
            <nav className={cn('space-y-1', sidebarCollapsed ? 'px-2' : 'px-2')}>
              {filteredNavItems.map(item => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={viewMode === item.id}
                  collapsed={sidebarCollapsed}
                  onClick={() => handleNavClick(item.id)}
                />
              ))}
            </nav>

            {/* Divider + Bottom nav — visible in BOTH states */}
            {filteredBottomNavItems.length > 0 && (
              <>
                {sidebarCollapsed ? (
                  <div className="my-3 mx-auto w-6 border-t border-border" />
                ) : (
                  <Separator className="my-4" />
                )}

                {/* Section heading — hidden when collapsed */}
                {!sidebarCollapsed && (
                  <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Account
                  </p>
                )}

                <nav className={cn('space-y-1', sidebarCollapsed ? 'px-2' : 'px-2')}>
                  {filteredBottomNavItems.map(item => (
                    <NavButton
                      key={item.id}
                      item={item}
                      isActive={viewMode === item.id}
                      collapsed={sidebarCollapsed}
                      onClick={() => handleNavClick(item.id)}
                    />
                  ))}
                </nav>
              </>
            )}
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
