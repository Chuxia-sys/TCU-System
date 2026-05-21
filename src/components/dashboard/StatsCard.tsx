'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: StatsCardProps) {
  const iconContainerStyles = {
    default: 'bg-red-500/10 text-red-500 dark:bg-[#EF4444]/10 dark:text-[#EF4444]',
    success: 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400',
    danger: 'bg-red-500/10 text-red-500 dark:bg-[#EF4444]/10 dark:text-[#EF4444]',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card
        className={cn(
          'relative overflow-hidden border-0 shadow-lg transition-all duration-300 cursor-default group',
          // Light mode
          'bg-white shadow-black/5',
          // Dark mode — premium card with subtle border
          'dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow',
          // Hover — lift up with brighter border
          'hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
          'dark:hover:border-[#EF4444]/20',
          className
        )}
        style={{ borderRadius: '20px' }}
      >
        {/* Subtle border glow overlay */}
        <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none transition-colors duration-300 group-hover:border-white/[0.08] dark:group-hover:border-[#EF4444]/20" />
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 rounded-[20px] bg-gradient-to-br from-transparent via-transparent to-red-500/[0.02] dark:to-[#EF4444]/[0.03] pointer-events-none" />

        <div className="relative">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-5 pt-5">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-[#94A3B8]">{title}</CardTitle>
            <div className={cn(
              'flex items-center justify-center w-10 h-10 rounded-2xl transition-transform duration-300 group-hover:scale-110',
              iconContainerStyles[variant]
            )}>
              <Icon className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight dark:text-[#F8FAFC]">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground dark:text-[#64748B] mt-1">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                <div className={cn(
                  'flex items-center gap-0.5 text-xs font-semibold',
                  trend.positive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-[#EF4444]'
                )}>
                  {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
                </div>
                <span className="text-xs text-muted-foreground dark:text-[#64748B]">{trend.label}</span>
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}
