export function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

/** Cut name on rendered frames: RU name when the barber works in Russian. */
export function cutDisplayName(
  cut: { name_en: string; name_ru: string | null },
  barberLanguage: string | null | undefined,
): string {
  return barberLanguage === "ru" && cut.name_ru ? cut.name_ru : cut.name_en;
}

/** Dark placeholder tile for a failed generation slot (data URI, CSS-url safe). */
export function failedTileDataUri(label = "FAILED"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460">
  <rect width="460" height="460" fill="#0E1110"/>
  <rect x="6" y="6" width="448" height="448" fill="none" stroke="#3A403E" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="230" y="238" text-anchor="middle" font-family="monospace" font-size="17" letter-spacing="5" fill="#6E7573">${label}</text>
</svg>`;
  const encoded = encodeURIComponent(svg).replace(
    /[()']/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `data:image/svg+xml,${encoded}`;
}
