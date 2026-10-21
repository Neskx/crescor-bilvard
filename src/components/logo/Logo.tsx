/**
 * Official Crescor Bilvård logo (brand/logomain.png → public/logo, built by
 * scripts/process-logo.mjs). Silver artwork on transparency: use it on dark
 * backgrounds.
 */
export function Logo({ className, title = 'Crescor Bilvård', priority = false }: { className?: string; title?: string; priority?: boolean }) {
  return (
    <img
      src="/logo/crescor-logo.webp"
      width={720}
      height={193}
      alt={title}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      className={className}
    />
  );
}
