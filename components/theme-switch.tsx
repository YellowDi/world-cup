import { FC, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { useTheme } from "next-themes";
import clsx from "clsx";

import { SunFilledIcon, MoonFilledIcon } from "@/components/icons";

export interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch: FC<ThemeSwitchProps> = ({ className }) => {
  const [isMounted, setIsMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  const isLight = resolvedTheme === "light";

  const handleToggle = () => {
    setTheme(isLight ? "dark" : "light");
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <div aria-hidden className="w-6 h-6" />;

  return (
    <Button
      isIconOnly
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      className={clsx(
        "h-auto w-auto min-w-0 bg-transparent px-px text-muted hover:bg-transparent hover:opacity-80",
        className,
      )}
      variant="ghost"
      onPress={handleToggle}
    >
      {isLight ? <SunFilledIcon size={22} /> : <MoonFilledIcon size={22} />}
    </Button>
  );
};
