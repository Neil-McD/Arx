export const STRIPE_CONNECT_COUNTRIES = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "AG", name: "Antigua & Barbuda" },
  { code: "AL", name: "Albania" },
  { code: "AM", name: "Armenia" },
  { code: "AR", name: "Argentina" },
  { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" },
  { code: "BA", name: "Bosnia & Herzegovina" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "BH", name: "Bahrain" },
  { code: "BJ", name: "Benin" },
  { code: "BN", name: "Brunei" },
  { code: "BO", name: "Bolivia" },
  { code: "BS", name: "Bahamas" },
  { code: "BW", name: "Botswana" },
  { code: "CA", name: "Canada" },
  { code: "CH", name: "Switzerland" },
  { code: "CI", name: "Cote d'Ivoire" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EE", name: "Estonia" },
  { code: "EG", name: "Egypt" },
  { code: "ES", name: "Spain" },
  { code: "ET", name: "Ethiopia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "GH", name: "Ghana" },
  { code: "GM", name: "Gambia" },
  { code: "GR", name: "Greece" },
  { code: "GT", name: "Guatemala" },
  { code: "GY", name: "Guyana" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JO", name: "Jordan" },
  { code: "JP", name: "Japan" },
  { code: "KE", name: "Kenya" },
  { code: "KH", name: "Cambodia" },
  { code: "KR", name: "South Korea" },
  { code: "KW", name: "Kuwait" },
  { code: "LC", name: "Saint Lucia" },
  { code: "LK", name: "Sri Lanka" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "LV", name: "Latvia" },
  { code: "MA", name: "Morocco" },
  { code: "MC", name: "Monaco" },
  { code: "MD", name: "Moldova" },
  { code: "MG", name: "Madagascar" },
  { code: "MK", name: "North Macedonia" },
  { code: "MN", name: "Mongolia" },
  { code: "MO", name: "Macao SAR China" },
  { code: "MT", name: "Malta" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "NA", name: "Namibia" },
  { code: "NG", name: "Nigeria" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "OM", name: "Oman" },
  { code: "PA", name: "Panama" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PK", name: "Pakistan" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PY", name: "Paraguay" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RS", name: "Serbia" },
  { code: "RW", name: "Rwanda" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
  { code: "SN", name: "Senegal" },
  { code: "SV", name: "El Salvador" },
  { code: "TH", name: "Thailand" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TT", name: "Trinidad & Tobago" },
  { code: "TW", name: "Taiwan" },
  { code: "TZ", name: "Tanzania" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VN", name: "Vietnam" },
  { code: "ZA", name: "South Africa" },
] as const;

export type StripeConnectCountryCode = (typeof STRIPE_CONNECT_COUNTRIES)[number]["code"];

const STRIPE_CONNECT_COUNTRY_BY_CODE = new Map(
  STRIPE_CONNECT_COUNTRIES.map((country) => [country.code, country]),
);

export function normalizeStripeConnectCountry(raw: unknown): StripeConnectCountryCode | null {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return null;
  const code = value as StripeConnectCountryCode;
  return STRIPE_CONNECT_COUNTRY_BY_CODE.has(code) ? code : null;
}

export function isSupportedStripeConnectCountry(raw: unknown): boolean {
  return normalizeStripeConnectCountry(raw) !== null;
}

export function formatStripeConnectCountry(raw: unknown): string {
  const code = normalizeStripeConnectCountry(raw);
  if (!code) return "";
  const country = STRIPE_CONNECT_COUNTRY_BY_CODE.get(code);
  return country ? country.name : code;
}
