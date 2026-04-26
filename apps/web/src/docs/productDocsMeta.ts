import productDocsManifest from "../../../../docs/product/manifest.json";

type ProductDocsManifest = {
  defaultSlug: string;
};

const manifest = productDocsManifest as ProductDocsManifest;

export const PRODUCT_DOCS_DEFAULT_SLUG = manifest.defaultSlug;

