import { MARK } from "./brand";

/**
 * The mark as a plain SVG with fixed gradient ids, for generated images
 * (app icons, Open Graph) where hooks are unavailable. `rx` 0 fills the square
 * for maskable and Apple icons, which the OS rounds itself.
 */
export function StaticMark({ size, rx = 13, inset = 0 }: { size: number; rx?: number; inset?: number }) {
  // `inset` shrinks the drawing inside a full-bleed tile (maskable safe zone).
  const pad = inset * 48;
  return (
    <svg width={size} height={size} viewBox={`${-pad} ${-pad} ${48 + pad * 2} ${48 + pad * 2}`}>
      <defs>
        <linearGradient id="vkt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={MARK.tileFrom} />
          <stop offset="1" stopColor={MARK.tileTo} />
        </linearGradient>
        <linearGradient id="vkg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK.goldFrom} />
          <stop offset="1" stopColor={MARK.goldTo} />
        </linearGradient>
      </defs>
      <rect x={-pad} y={-pad} width={48 + pad * 2} height={48 + pad * 2} rx={rx} fill="url(#vkt)" />
      <path d={MARK.lapels} fill="none" stroke="url(#vkg)" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect {...MARK.collar} fill={MARK.band} />
      {MARK.bands.map((d) => (
        <path key={d} d={d} fill={MARK.band} />
      ))}
    </svg>
  );
}
