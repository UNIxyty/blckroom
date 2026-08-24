/**
 * BLACK ROOM design tokens — imported from the Claude Design project
 * (`BLACK ROOM System.dc.html`, D2 token spec). Every component reads from
 * here; change the look in this one file.
 */
export const tokens = {
  color: {
    canvas: "#080909", // page behind the app frame
    bg: "#0B0D0C", // app background
    surface: "#101312", // sheets, modals, camera stage
    divider: "#141817", // list dividers, skeleton base
    hairline: "#1A1E1D", // hairlines, progress track
    border: "#232927", // standard border / LED rule
    tile: "#2A302E", // filled tile
    borderStrong: "#3A403E", // strong border, emblem ring
    disabled: "#4A5150", // disabled text, mono tokens
    tertiary: "#6E7573", // tertiary text
    secondary: "#A8AEAB", // secondary text
    primary: "#F2F3F1", // primary text, CTA fill
  },
  font: {
    serif: "'Cormorant Garamond', Georgia, serif",
    sans: "'Archivo', Helvetica, Arial, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  // type scale (px) — D2: hero 88 · home CTA 38 · tour 32-34 · screen title 30 ·
  // section 28 · name 26 · row emphasis 16 · input 15 · body 14 · secondary 13 ·
  // meta 12 · caption 11 · micro 10
  text: {
    hero: 88,
    homeCta: 38,
    tour: 32,
    screenTitle: 28,
    name: 26,
    rowEmphasis: 16,
    input: 15,
    body: 14,
    secondary: 13,
    meta: 12,
    caption: 11,
    micro: 10,
  },
  space: [0, 4, 8, 10, 12, 20, 26, 32, 44, 64] as const,
  gutter: 20,
  sectionGap: 32,
  height: {
    topBar: 56,
    row: 64,
    cta: 56,
    secondary: 52,
    segment: 44,
    target: 44,
  },
  radius: 0, // radius 0 everywhere; only circles round
  duration: {
    nav: 160,
    sheet: 200,
    shimmer: 2400,
    sweep: 2600,
    tour: 3400,
  },
  easing: {
    enter: "cubic-bezier(.2,.8,.2,1)",
    exit: "cubic-bezier(.4,0,1,1)",
    loop: "ease-in-out",
  },
} as const;

/** Push the palette + core scales onto :root as CSS custom properties. */
export function applyTheme(): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(tokens.color)) {
    root.setProperty(`--c-${name}`, value);
  }
  root.setProperty("--f-serif", tokens.font.serif);
  root.setProperty("--f-sans", tokens.font.sans);
  root.setProperty("--f-mono", tokens.font.mono);
  root.setProperty("--gutter", `${tokens.gutter}px`);
  root.setProperty("--h-topbar", `${tokens.height.topBar}px`);
  root.setProperty("--h-cta", `${tokens.height.cta}px`);
  root.setProperty("--h-secondary", `${tokens.height.secondary}px`);
  root.setProperty("--h-segment", `${tokens.height.segment}px`);
  root.setProperty("--dur-nav", `${tokens.duration.nav}ms`);
  root.setProperty("--dur-sheet", `${tokens.duration.sheet}ms`);
  root.setProperty("--dur-shimmer", `${tokens.duration.shimmer}ms`);
  root.setProperty("--dur-sweep", `${tokens.duration.sweep}ms`);
  root.setProperty("--ease-enter", tokens.easing.enter);
  root.setProperty("--ease-exit", tokens.easing.exit);
}
