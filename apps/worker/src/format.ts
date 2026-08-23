const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function formatPrice(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const whole = cents / 100;
  const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(2);
  return `${symbol} ${text}`;
}

export function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

export function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

/** Dark placeholder tile for a failed generation slot (data URI, CSS-url safe). */
export function failedTileDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420">
  <rect width="420" height="420" fill="#101312"/>
  <line x1="0" y1="0" x2="420" y2="420" stroke="#1A1E1D" stroke-width="1"/>
  <line x1="420" y1="0" x2="0" y2="420" stroke="#1A1E1D" stroke-width="1"/>
  <text x="210" y="216" text-anchor="middle" font-family="monospace" font-size="15" letter-spacing="4" fill="#4A5150">UNAVAILABLE</text>
</svg>`;
  const encoded = encodeURIComponent(svg).replace(
    /[()']/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `data:image/svg+xml,${encoded}`;
}
