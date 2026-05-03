/**
 * Aurora-style animated background.
 *
 * Pure CSS — three large radial gradient blobs slowly drift and rotate
 * around the viewport. Inspired by the reactbits.dev Aurora component
 * but without the WebGL dependency, so it's lighter and works everywhere.
 *
 * Usage: place at the top of a relatively-positioned container; the
 * blobs are absolute-positioned and `pointer-events-none`.
 */
export function AuroraBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div className="aurora-blob absolute -top-1/3 -left-1/4 h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.7_0.18_265/0.35),transparent_60%)] blur-3xl" />
      <div
        className="aurora-blob absolute top-1/2 -right-1/4 h-[55vmax] w-[55vmax] -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,oklch(0.75_0.15_180/0.28),transparent_60%)] blur-3xl"
        style={{ animationDelay: "-8s" }}
      />
      <div
        className="aurora-blob absolute -bottom-1/3 left-1/3 h-[50vmax] w-[50vmax] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.78_0.16_310/0.3),transparent_60%)] blur-3xl"
        style={{ animationDelay: "-15s" }}
      />
    </div>
  );
}
