/**
 * BlurText — word-by-word reveal with blur fade-in.
 *
 * Splits the input on whitespace and renders each word as a span with
 * a staggered animation-delay. Pure CSS (no framer-motion).
 *
 * Inspired by reactbits.dev BlurText.
 */
export function BlurText({
  text,
  className = "",
  delay = 0,
  step = 60,
}: {
  text: string;
  /** Tailwind classes applied to the wrapper. */
  className?: string;
  /** Initial delay in ms before the first word starts animating. */
  delay?: number;
  /** Per-word stagger in ms. */
  step?: number;
}) {
  const words = text.split(/(\s+)/);
  return (
    <span className={className}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
        return (
          <span
            key={i}
            className="inline-block opacity-0"
            style={{
              animation: "blur-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              animationDelay: `${delay + (i / 2) * step}ms`,
            }}
          >
            {w}
          </span>
        );
      })}
    </span>
  );
}
