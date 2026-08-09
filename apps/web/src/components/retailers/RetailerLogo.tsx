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
  compactMaxHeight?: number;
  compactMaxWidth?: number;
  maxHeight?: number;
  maxWidth?: number;
};

const logoSources: Record<string, RetailerLogoDefinition> = {
  coles: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Coles_logo.svg",
    alt: "Coles",
    width: 1000,
    height: 312,
    compactMaxHeight: 30,
    compactMaxWidth: 112,
  },
  woolworths: {
    src: "https://cdn0.woolworths.media/content/content/wk34-wow-wapple-logo-horizontal-1200x1200.png",
    alt: "Woolworths",
    width: 240,
    height: 70,
    compactMaxHeight: 22,
    compactMaxWidth: 100,
    maxHeight: 32,
    maxWidth: 150,
  },
  aldi: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Aldi_S%C3%BCd_2017_logo.svg",
    alt: "ALDI",
    width: 82,
    height: 99,
    compactMaxHeight: 42,
    compactMaxWidth: 42,
    maxHeight: 52,
    maxWidth: 52,
  },
  iga: {
    src: "https://commons.wikimedia.org/wiki/Special:Redirect/file/IGA_logo.svg",
    alt: "IGA",
    width: 346,
    height: 224,
    compactMaxHeight: 34,
    compactMaxWidth: 70,
  },
  drakes: {
    src: "https://drakes.com.au/wp-content/themes/drakes/dist/images/logo_f58734b9.png",
    alt: "Drakes Supermarkets",
    width: 320,
    height: 120,
    compactMaxHeight: 34,
    compactMaxWidth: 112,
    maxHeight: 42,
    maxWidth: 142,
  },
  costco: {
    src: "https://azure-na-images.contentstack.com/v3/assets/bltb4bed6e99fbc58cf/blte277240c426b2ca2/6823cf47e7c6dbe1c2e5d016/australia-consignments-invoice-logo.png",
    alt: "Costco Wholesale",
    width: 512,
    height: 183,
    compactMaxHeight: 30,
    compactMaxWidth: 112,
  },
};

const aliases: Record<string, string> = {
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

  const maxHeight = compact ? (logo.compactMaxHeight ?? 24) : (logo.maxHeight ?? 38);
  const maxWidth = compact ? (logo.compactMaxWidth ?? 92) : (logo.maxWidth ?? 132);
  const ratio = logo.width / logo.height;
  const height = Math.min(maxHeight, Math.round(maxWidth / ratio));
  const width = Math.min(maxWidth, Math.round(height * ratio));

  return (
    <span aria-label={logo.alt} className={className} data-retailer-logo={sourceKey} role="img">
      <img
        alt=""
        decoding="async"
        height={height}
        loading="lazy"
        referrerPolicy="no-referrer"
        src={logo.src}
        style={{ background: "transparent", display: "block", objectFit: "contain" }}
        width={width}
      />
    </span>
  );
}
