// Fideon OS Brand Colors — White + Indigo Light Theme
export const COLORS = {
  // Primary indigo palette
  indigo: "#5B4ED4",        // hsl(245, 58%, 51%)
  indigoLight: "#7B6FE8",   // hsl(245, 65%, 62%)
  indigoDark: "#3D32A8",    // hsl(245, 58%, 42%)
  indigoGlow: "rgba(91, 78, 212, 0.15)",
  indigoSoft: "rgba(91, 78, 212, 0.08)",

  // Accent colors
  amber: "#D97706",         // darker amber for light bg
  emerald: "#059669",       // darker emerald for light bg
  rose: "#DC2626",          // red for gaps/errors

  // Backgrounds — LIGHT THEME
  background: "#FFFFFF",
  backgroundSoft: "#F8F7FF",   // very slight indigo tint
  backgroundMuted: "#F1F0FB",  // light indigo wash
  cardBg: "#FFFFFF",
  darkGlass: "rgba(255, 255, 255, 0.9)",

  // Text — dark on light
  textPrimary: "#1A1A2E",
  textSecondary: "#4A4A6A",
  textMuted: "#8888A8",
  white: "#FFFFFF",

  // Borders
  borderSubtle: "rgba(91, 78, 212, 0.15)",
  borderLight: "rgba(0, 0, 0, 0.08)",
};

// Gradient backgrounds — light premium feel
export const GRADIENTS = {
  mainBg: `radial-gradient(ellipse at 50% 30%, ${COLORS.indigoSoft} 0%, ${COLORS.background} 70%)`,
  subtleBg: `radial-gradient(ellipse at 50% 50%, rgba(91,78,212,0.06) 0%, ${COLORS.background} 60%)`,
  shieldGlow: `radial-gradient(circle, rgba(91,78,212,0.12) 0%, transparent 70%)`,
  premiumCard: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.indigoLight})`,
  heroBg: `radial-gradient(ellipse at 50% 40%, rgba(91,78,212,0.1) 0%, ${COLORS.backgroundSoft} 55%)`,
};
