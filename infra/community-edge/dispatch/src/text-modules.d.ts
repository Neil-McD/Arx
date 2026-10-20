// Bundled files the edge serves as text (wrangler "Text" rule; a vitest plugin in tests).
declare module "*.bundle.js" {
  const text: string;
  export default text;
}
