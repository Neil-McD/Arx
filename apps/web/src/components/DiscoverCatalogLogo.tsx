import { useState } from "react";

type DiscoverCatalogLogoProps = {
  name: string;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  size?: "list" | "detail";
};

function buildFallbackLabel(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function DiscoverCatalogLogo(props: DiscoverCatalogLogoProps) {
  const { name, logoUrl, logoUrlDark, size = "list" } = props;
  const [didError, setDidError] = useState(false);
  const src = logoUrl ?? logoUrlDark ?? null;

  return (
    <div
      className={`discover-catalog-logo${
        size === "detail" ? " discover-catalog-logo-detail" : ""
      }`}
      aria-hidden="true"
    >
      {src && !didError ? (
        <img
          className="discover-catalog-logo-image"
          src={src}
          alt=""
          loading="lazy"
          onError={() => setDidError(true)}
        />
      ) : (
        <span className="discover-catalog-logo-fallback">{buildFallbackLabel(name)}</span>
      )}
    </div>
  );
}
