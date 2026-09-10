/** Per-member accent colours, picked to stay legible in both themes. */
export const MEMBER_COLORS = [
  "#e0724a", "#3f8ecb", "#4faa72", "#c2569c",
  "#c99a2e", "#7a6ad8", "#4aa8a8", "#cc5b5b",
] as const;

export function memberColor(index: number): string {
  return MEMBER_COLORS[((index % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
