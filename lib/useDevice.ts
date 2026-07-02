"use client";

import { useEffect, useState } from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  type: DeviceType;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
}

function getDeviceType(width: number): DeviceType {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function getDeviceInfo(): DeviceInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const type = getDeviceType(width);
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return {
    type,
    width,
    height,
    isMobile: type === "mobile",
    isTablet: type === "tablet",
    isDesktop: type === "desktop",
    isTouchDevice,
  };
}

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>({
    type: "desktop",
    width: 1280,
    height: 800,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
  });

  useEffect(() => {
    // Set nilai awal setelah mount (client-side)
    setDevice(getDeviceInfo());

    const observer = new ResizeObserver(() => {
      setDevice(getDeviceInfo());
    });

    observer.observe(document.documentElement);

    return () => observer.disconnect();
  }, []);

  return device;
}
