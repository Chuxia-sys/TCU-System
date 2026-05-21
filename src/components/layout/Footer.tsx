'use client';

import React from 'react';
import Image from 'next/image';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t bg-background dark:bg-[#0F172A] border-border dark:border-[#1E293B]">
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/30 dark:via-[#EF4444]/20 to-transparent" />
      
      <div className="container mx-auto px-4 lg:px-6">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row items-center justify-between py-5 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-red-500/5 dark:bg-[#EF4444]/10 blur-sm" />
              <Image
                src="/tcu-logo.png"
                alt="TCU Logo"
                width={26}
                height={26}
                className="relative bg-white dark:bg-white/10 rounded-xl p-0.5 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight font-heading dark:text-[#F8FAFC]">TCU</span>
              <span className="text-[10px] text-muted-foreground dark:text-[#64748B] tracking-wide">
                Taguig City University
              </span>
            </div>
          </div>

          {/* Center Tagline */}
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground dark:text-[#64748B]">
            <div className="h-1 w-1 rounded-full bg-red-500/40 dark:bg-[#EF4444]/30" />
            <span>Intelligent Scheduling System</span>
            <div className="h-1 w-1 rounded-full bg-red-500/40 dark:bg-[#EF4444]/30" />
          </div>

          {/* Copyright */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground dark:text-[#64748B]">
            <span>© {currentYear}</span>
            <span className="hidden sm:inline text-red-500/60 dark:text-[#EF4444]/40">TCU.</span>
            <span className="hidden sm:inline">All rights reserved.</span>
            <span className="sm:hidden">All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
