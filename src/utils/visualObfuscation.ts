import { useEffect, useState } from "react";

const OBFUSCATION_GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function obfuscateIdentifierClient(identifier: string, tick: number): string {
  if (!identifier || identifier.length <= 10) return identifier;
  const prefix = identifier.slice(0, 5);
  const suffix = identifier.slice(-4);
  const bodyLen = Math.min(18, identifier.length - 9);
  let rotated = "";

  for (let i = 0; i < bodyLen; i++) {
    const code = identifier.charCodeAt(i + 5);
    const index = (code + tick * 7 + i * 13) % OBFUSCATION_GLYPHS.length;
    rotated += OBFUSCATION_GLYPHS[index];
  }

  return `${prefix}·${rotated}·${suffix}`;
}

export function useVisualObfuscation(enabled: boolean): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return tick;
}
