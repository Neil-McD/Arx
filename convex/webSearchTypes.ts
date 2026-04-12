export type NormalizedSearchResult = {
  title: string;
  url: string;
  snippet: string | null;
  backend: "openai" | "xai" | "fallback";
};

export type StructuredWebSource = {
  url: string;
  host: string;
  label: string;
  snippet: string | null;
  backend: "openai" | "xai" | "fallback" | "page";
  kind: "search" | "opened";
};
