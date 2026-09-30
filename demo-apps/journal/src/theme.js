// The app's design: colors, corners, card style and fonts.
// Written by Appmaker from the Design tab — change the design there, not here.
export const mode = "light";
export const colors = {
  "primary": "#2563EB",
  "onPrimary": "#FFFFFF",
  "primarySoft": "#e5ecfd",
  "background": "#F7F7FA",
  "surface": "#FFFFFF",
  "text": "#111827",
  "muted": "#5F6B7A",
  "border": "#E5E7EB",
  "success": "#047857",
  "danger": "#B91C1C"
};
export const radius = {"sm":8,"md":14,"lg":20,"pill":999};
export const font = {"heading":"800","body":"400"};
export const card = {"backgroundColor":"#FFFFFF","borderRadius":20,"boxShadow":"0px 4px 12px rgba(17, 24, 39, 0.08)"};

const theme = { mode, colors, radius, font, card };
export default theme;
