/**
 * Fixture data for the sample CLI — nine placeholder "portraits" as inline SVG
 * data URIs in the Black Room palette, so the renderer can be verified with no
 * external services.
 */
function placeholderPortrait(seed: number): string {
  const tones = ["#161A19", "#181C1B", "#141817", "#171B1A", "#151918"];
  const skin = tones[seed % tones.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="v" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#1E2322"/>
      <stop offset="100%" stop-color="#0E1110"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#v)"/>
  <ellipse cx="512" cy="418" rx="${168 + (seed % 3) * 8}" ry="${218 + (seed % 4) * 6}" fill="${skin}"/>
  <path d="M 232 1024 Q 512 ${640 - (seed % 3) * 12} 792 1024 Z" fill="${skin}"/>
  <text x="512" y="948" text-anchor="middle" font-family="monospace" font-size="26" letter-spacing="6" fill="#3A403E">SAMPLE ${seed}</text>
</svg>`;
  // encodeURIComponent leaves ( ) ' alone — escape them too, they would break
  // both the CSS url('…') context and the injector's URL safety check.
  const encoded = encodeURIComponent(svg).replace(
    /[()']/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `data:image/svg+xml,${encoded}`;
}

export interface FixtureCut {
  name: string;
  price: string;
  duration: string;
  image_url: string;
}

const CUTS: Array<[string, string, string]> = [
  ["Buzz Cut", "€ 20", "30 min"],
  ["Crew Cut", "€ 25", "40 min"],
  ["French Crop", "€ 25", "45 min"],
  ["Mid Fade", "€ 30", "50 min"],
  ["Skin Fade", "€ 28", "45 min"],
  ["Undercut", "€ 28", "45 min"],
  ["Pompadour", "€ 32", "55 min"],
  ["Quiff", "€ 30", "50 min"],
  ["Slick Back", "€ 28", "45 min"],
];

export const fixtureCuts: FixtureCut[] = CUTS.map(([name, price, duration], i) => ({
  name,
  price,
  duration,
  image_url: placeholderPortrait(i + 1),
}));

export const fixtureMeta = {
  barber_name: "Andrejs",
  date: "24 Aug 2026",
  sheet_url: "https://blackroom.example/s/9f2c1a",
};
