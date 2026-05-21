'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface ChartData {
  day?: string;
  count?: number;
  status?: string;
  value?: number;
  name?: string;
}

interface SchedulesChartProps {
  data: ChartData[];
  title: string;
  description?: string;
  type: 'bar' | 'pie' | 'line';
}

// Premium red palette for dark mode
const RED_PALETTE = [
  '#EF4444', // Primary red
  '#B91C1C', // Dark red
  '#F87171', // Light red
  '#991B1B', // Deep red
  '#D4AF37', // Gold accent
];

// Custom tooltip — declared outside render to avoid re-creation
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1E293B] dark:bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 shadow-xl shadow-black/30">
        <p className="text-xs font-medium text-[#94A3B8] mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-semibold text-[#F8FAFC]">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export function SchedulesChart({ data, title, description, type }: SchedulesChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card
        className="relative overflow-hidden border-0 shadow-lg dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow transition-all duration-300"
        style={{ borderRadius: '20px' }}
      >
        {/* Subtle border */}
        <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none" />
        {/* Gradient overlay */}
        <div className="absolute inset-0 rounded-[20px] bg-gradient-to-br from-transparent via-transparent to-red-500/[0.02] dark:to-[#EF4444]/[0.03] pointer-events-none" />

        <div className="relative">
          <CardHeader className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-red-500/10 dark:bg-[#EF4444]/10">
                {type === 'pie' ? (
                  <PieChartIcon className="w-5 h-5 text-red-500 dark:text-[#EF4444]" />
                ) : (
                  <BarChart3 className="w-5 h-5 text-red-500 dark:text-[#EF4444]" />
                )}
              </div>
              <div>
                <CardTitle className="text-base font-semibold dark:text-[#F8FAFC]">{title}</CardTitle>
                {description && <CardDescription className="dark:text-[#64748B]">{description}</CardDescription>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {type === 'bar' ? (
                  <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      {/* Red gradient for bars — the premium look */}
                      <linearGradient id="redBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#B91C1C" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="redBarGradientLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B0000" stopOpacity={1} />
                        <stop offset="50%" stopColor="#C00018" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#6D0000" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: '#94A3B8' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: '#94A3B8' }}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(239, 68, 68, 0.06)' }} />
                    <Bar
                      dataKey="count"
                      fill="url(#redBarGradientLight)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={45}
                      className="dark:[fill:url(#redBarGradient)]"
                    />
                  </BarChart>
                ) : type === 'pie' ? (
                  <PieChart>
                    <defs>
                      {RED_PALETTE.map((color, index) => (
                        <linearGradient key={`pieGradient-${index}`} id={`pieGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {data.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={`url(#pieGradient-${index % RED_PALETTE.length})`}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', color: '#94A3B8' }}
                    />
                  </PieChart>
                ) : (
                  <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="lineGradientRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#B91C1C" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#EF4444"
                      strokeWidth={3}
                      dot={{ fill: '#EF4444', strokeWidth: 2, r: 4 }}
                      activeDot={{ fill: '#EF4444', strokeWidth: 2, r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}
