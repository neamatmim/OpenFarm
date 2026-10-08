"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // A colored toast in the app's own tones, whose text holds 4.5:1 on its ground in both themes; Sonner's
          // own rich colors fall to about 3:1 in light (WCAG 1.4.3).
          "--success-bg": "var(--success-surface)",
          "--success-text": "var(--success)",
          "--success-border":
            "color-mix(in oklch, var(--success) 30%, transparent)",
          "--info-bg": "var(--info-surface)",
          "--info-text": "var(--info)",
          "--info-border": "color-mix(in oklch, var(--info) 30%, transparent)",
          "--warning-bg": "var(--warning-surface)",
          "--warning-text": "var(--warning)",
          "--warning-border":
            "color-mix(in oklch, var(--warning) 30%, transparent)",
          "--error-bg": "var(--danger-surface)",
          "--error-text": "var(--danger)",
          "--error-border":
            "color-mix(in oklch, var(--danger) 30%, transparent)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
