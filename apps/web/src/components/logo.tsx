/** Wordmark on the navy sidebar / login card. Files live in public/brand. */
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
      width={140}
      height={28}
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
