/**
 * Postrail wordmark and icon. Files live in public/brand; the sources are in /brand at the
 * repo root. The wordmark SVG is trimmed to its content (794x230), so set the height with a
 * class and let the width follow. Give it at least h-8: the icon in the wordmark is taller than
 * the letters, so anything smaller makes the name hard to read.
 */
export function Logo({
  variant = 'dark',
  className,
}: {
  variant?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <img
      src={variant === 'dark' ? '/brand/postrail-logo-dark.svg' : '/brand/postrail-logo-light.svg'}
      alt="Postrail"
      width={110}
      height={32}
      className={className}
    />
  );
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <img
      src="/brand/postrail-icon.svg"
      alt="Postrail"
      width={28}
      height={28}
      className={className}
    />
  );
}
