type BrandLogoProps = { className?: string };

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span className={`brand-logo ${className}`.trim()}>
      <img src="/dj3-engineering-logo.png" alt="DJ3 Engineering" />
    </span>
  );
}
