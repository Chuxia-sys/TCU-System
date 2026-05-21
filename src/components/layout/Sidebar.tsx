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

/* ── Shared nav button ── */
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
        'flex w-full items-center rounded-xl text-sm font-medium transition-all duration-200 ease-out group',
        // Expanded layout
        !collapsed && 'gap-3 px-3.5 py-2.5',
        // Collapsed layout
        collapsed && 'justify-center p-2.5 mx-auto w-10 h-10',
        // Active state — red translucent bg + red left border
        isActive && !collapsed && 'bg-red-50 dark:bg-red-500/[0.12] text-red-700 dark:text-[#F8FAFC] border-l-2 border-red-600 dark:border-[#EF4444] pl-[calc(0.875rem-2px)]',
        // Active collapsed — solid red bg
        isActive && collapsed && 'bg-red-600 dark:bg-[#EF4444] text-white shadow-lg shadow-red-500/25 dark:shadow-[#EF4444]/25',
        // Inactive state
        !isActive && !collapsed && 'text-gray-600 dark:text-[#94A3B8] border-l-2 border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-[#F8FAFC] hover:translate-x-0.5',
        !isActive && collapsed && 'text-gray-600 dark:text-[#94A3B8] hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-[#F8FAFC]',
      )}
    >
      <Icon className={cn(
        'shrink-0 transition-colors duration-200 h-[18px] w-[18px]',
        // Active + collapsed: white icon on red bg
        isActive && collapsed ? 'text-white' : '',
        // Active + expanded: red accent icon
        isActive && !collapsed ? 'text-red-600 dark:text-[#EF4444]' : '',
        // Inactive: muted color (visible on both light/dark)
        !isActive ? 'text-gray-500 dark:text-[#94A3B8]' : '',
      )} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-600 dark:bg-[#EF4444] text-[10px] text-white font-semibold shadow-sm">
          {item.badge}
        </span>
      )}
      {collapsed && item.badge && (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 dark:bg-[#EF4444]" />
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">{btn}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium dark:bg-[#1E293B] dark:border-[#334155]" sideOffset={8}>
          {item.label}
          {item.badge && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 dark:bg-[#EF4444] px-1 text-[10px] text-white font-semibold">
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
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out flex-col',
          sidebarCollapsed ? 'w-[68px]' : 'w-[260px]'
        )}
      >
        {/* ── Header: Logo + Burger ── */}
        <div
          className={cn(
            'flex items-center shrink-0 h-14 md:h-[72px] transition-colors duration-300',
            'bg-[#8b0000] dark:header-gradient border-0 border-none outline-none shadow-none',
            sidebarCollapsed ? '' : 'gap-2 px-4'
          )}
        >
          {/* Expanded logo + text */}
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="bg-white rounded-lg p-1 shrink-0">
                <Image src="/tcu-logo.png" alt="TCU Logo" width={32} height={32} className="object-contain" />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-bold text-white tracking-wide leading-none">TCU</h1>
                <p className="text-[9px] text-white/50 font-medium leading-none mt-0.5">Scheduling System</p>
              </div>
            </div>
          )}

          {/* Expanded burger */}
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 dark:hover:bg-white/[0.06] shrink-0 rounded-lg transition-all duration-200"
              aria-label="Collapse sidebar"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}

          {/* Collapsed: logo + burger side by side */}
          {sidebarCollapsed && (
            <div className="flex items-center gap-1.5 w-full px-2.5">
              <div className="bg-white rounded-lg p-1 shrink-0">
                <Image src="/tcu-logo.png" alt="TCU Logo" width={24} height={24} className="object-contain" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10 dark:hover:bg-white/[0.06] shrink-0 rounded-lg transition-all duration-200"
                aria-label="Expand sidebar"
              >
                <Menu className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* ── Scrollable Navigation Area ── */}
        <ScrollArea className="flex-1 bg-card dark:bg-[#111827] premium-scrollbar overflow-x-hidden">
          <div className="py-4">
            {/* Section heading */}
            {!sidebarCollapsed && filteredNavItems.length > 0 && (
              <p className="px-4 py-2 text-[11px] font-semibold text-muted-foreground dark:text-[#64748B] uppercase tracking-[0.08em]">
                Main Menu
              </p>
            )}

            {/* Main nav items */}
            <nav className={cn('space-y-0.5', sidebarCollapsed ? 'px-2' : 'px-3')}>
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

            {/* Divider + Bottom nav */}
            {filteredBottomNavItems.length > 0 && (
              <>
                {sidebarCollapsed ? (
                  <div className="my-3 mx-auto w-6 border-t border-border dark:border-[#1E293B]" />
                ) : (
                  <Separator className="my-4 mx-3 dark:bg-[#1E293B]" />
                )}

                {!sidebarCollapsed && (
                  <p className="px-4 py-2 text-[11px] font-semibold text-muted-foreground dark:text-[#64748B] uppercase tracking-[0.08em]">
                    Account
                  </p>
                )}

                <nav className={cn('space-y-0.5', sidebarCollapsed ? 'px-2' : 'px-3')}>
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
