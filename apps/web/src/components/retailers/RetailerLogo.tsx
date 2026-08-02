type RetailerLogoProps = {
  retailer: string;
  compact?: boolean;
  className?: string;
};

type RetailerLogoDefinition = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

const logoSources = {
  coles: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Coles_logo.svg",
    alt: "Coles",
    width: 1000,
    height: 312,
  },
  woolworths: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Woolworths_Limited_Logo.svg",
    alt: "Woolworths",
    width: 839,
    height: 119,
  },
  aldi: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Aldi_S%C3%BCd_2017_logo.svg",
    alt: "ALDI",
    width: 82,
    height: 99,
  },
  iga: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/IGA_logo.svg",
    alt: "IGA",
    width: 346,
    height: 224,
  },
  drakes: {
    src: "https://dtgxwmigmg3gc.cloudfront.net/images/5a615f7252ba0b73b201addb",
    alt: "Drakes Supermarkets",
    width: 320,
    height: 120,
  },
  costco: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Costco_Wholesale.svg",
    alt: "Costco Wholesale",
    width: 512,
    height: 183,
  },
} satisfies Record<string, RetailerLogoDefinition>;

const aliases: Record<string, keyof typeof logoSources> = {
  coles: "coles",
  "coles supermarket": "coles",
  "coles supermarkets": "coles",
  woolworths: "woolworths",
  "woolworths supermarket": "woolworths",
  "woolworths supermarkets": "woolworths",
  woolies: "woolworths",
  aldi: "aldi",
  "aldi stores": "aldi",
  iga: "iga",
  "iga supermarket": "iga",
  "iga supermarkets": "iga",
  drakes: "drakes",
  "drakes supermarket": "drakes",
  "drakes supermarkets": "drakes",
  costco: "costco",
  "costco wholesale": "costco",
};

function normaliseRetailer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-AU")
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function RetailerLogo({ retailer, compact = false, className }: RetailerLogoProps) {
  const sourceKey = aliases[normaliseRetailer(retailer)];
  const logo = sourceKey ? logoSources[sourceKey] : null;

  if (!logo) {
    return <span className={className}>{retailer}</span>;
  }

  const maxHeight = compact ? 24 : 38;
  const maxWidth = compact ? 92 : 132;
  const ratio = logo.width / logo.height;
  const height = Math.min(maxHeight, Math.round(maxWidth / ratio));
  const width = Math.min(maxWidth, Math.round(height * ratio));

  return (
    <img
      alt={logo.alt}
      className={className}
      decoding="async"
      height={height}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={logo.src}
      style={{ background: "transparent", objectFit: "contain" }}
      width={width}
    />
  );
}
