type RetailerLogoProps = {
  retailer: string;
  compact?: boolean;
  className?: string;
};

const logos: Record<string, { src: string; alt: string; width: number; height: number }> = {
  coles: { src: "/retailer-logos/coles.svg", alt: "Coles", width: 90, height: 32 },
  woolworths: { src: "/retailer-logos/woolworths.svg", alt: "Woolworths", width: 110, height: 32 },
};

export function RetailerLogo({ retailer, compact = false, className }: RetailerLogoProps) {
  const key = retailer.trim().toLocaleLowerCase("en-AU");
  const logo = logos[key];

  if (!logo) {
    return <span className={className}>{retailer}</span>;
  }

  const height = compact ? 22 : logo.height;
  const width = Math.round((logo.width / logo.height) * height);

  return (
    <img
      alt={logo.alt}
      className={className}
      height={height}
      loading="lazy"
      src={logo.src}
      width={width}
    />
  );
}
