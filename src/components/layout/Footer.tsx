'use client';

import React from 'react';
import Image from 'next/image';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t bg-background">
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-primary/30" />
      
      <div className="container mx-auto px-4 lg:px-6">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row items-center justify-between py-6 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-primary/10 dark:bg-primary/20 blur-sm" />
              <Image
                src="/tcu-logo.png"
                alt="TCU Logo"
                width={28}
                height={28}
                className="relative bg-white dark:bg-white/10 rounded-lg p-0.5 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight font-heading">TCU</span>
              <span className="text-[10px] text-muted-foreground tracking-wide">
                Taguig City University
              </span>
            </div>
          </div>

          {/* Center Tagline */}
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1 w-1 rounded-full bg-primary/40" />
            <span>Intelligent Scheduling System</span>
            <div className="h-1 w-1 rounded-full bg-primary/40" />
          </div>

          {/* Copyright */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>© {currentYear}</span>
            <span className="hidden sm:inline text-primary/60">TCU.</span>
            <span className="hidden sm:inline">All rights reserved.</span>
            <span className="sm:hidden">All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
