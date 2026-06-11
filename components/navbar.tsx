"use client";

import NextLink from "next/link";

import { ThemeSwitch } from "@/components/theme-switch";
import { siteConfig } from "@/config/site";

export const Navbar = () => {
  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#07090c]/85 backdrop-blur-lg">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <NextLink className="flex items-center gap-3" href="/">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-emerald-400 text-sm font-black text-[#07100b]">
            26
          </span>
          <span className="text-sm font-semibold tracking-normal text-white">
            世界杯收益榜
          </span>
        </NextLink>

        <div className="flex items-center gap-4">
          <ul className="hidden items-center gap-4 sm:flex">
            {siteConfig.navItems.map((item) => (
              <li key={item.href}>
                <NextLink
                  className="text-sm text-zinc-400 transition-colors hover:text-white"
                  href={item.href}
                >
                  {item.label}
                </NextLink>
              </li>
            ))}
          </ul>
          <ThemeSwitch />
        </div>
      </header>
    </nav>
  );
};
