import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { COMMUNITY_DESIGN_CONTRACT_VERSION } from "../shared/communityDesignContract";
import { normalizeCommunityLayout } from "../shared/communityLayout";
import { normalizeCommunityTheme } from "../shared/communityTheme";
import {
  TEMPLATES_DIR, designFiles, draftPreviewUrl, initFromTemplate, listTemplates, publishFolderDraft, pullDesign, saveFolderDraft,
} from "../packages/polynet-cli/design.mjs";
import { checkBrand, checkLayout, checkTheme, checkThemeAgainstBrand } from "../packages/polynet-cli/content.mjs";

test("every template is a valid design record on the current contract", async () => {
  const templates = await listTemplates();
  expect(templates.length).toBeGreaterThan(0);
  for (const template of templates) {
    expect(template.contract, template.name).toBe(COMMUNITY_DESIGN_CONTRACT_VERSION);
    expect(template.description, template.name).toBeTruthy();
    const files = readdirSync(join(TEMPLATES_DIR, template.name));
    expect(files, `${template.name} ships no content`).not.toContain("courses");
    const theme = JSON.parse(readFileSync(join(TEMPLATES_DIR, template.name, "theme.json"), "utf8"));
    expect(normalizeCommunityTheme(theme), template.name).toMatchObject({ ok: true });
    if (files.includes("layout.json")) {
      const layout = JSON.parse(readFileSync(join(TEMPLATES_DIR, template.name, "layout.json"), "utf8"));
      expect(normalizeCommunityLayout(layout), template.name).toMatchObject({ ok: true });
    }
  }
});

test("a folder goes from template to draft to published, and a stale folder can't overwrite a newer draft", async () => {
  const root = mkdtempSync(join(tmpdir(), "polynet-design-"));
  const files = designFiles(root);
  await initFromTemplate({ root, template: "stopwatch" });
  await expect(initFromTemplate({ root, template: "stopwatch" })).rejects.toThrow("already has a theme.json");
  await expect(initFromTemplate({ root: join(root, "x"), template: "nope" })).rejects.toThrow('No template named "nope"');

  // A stand-in for the MCP: one community's theme and layout, each with its own draft revisions.
  const fake = fakeDesignServer();
  const { call, calls, server } = fake;
  const check = (kind: string, record: unknown) => (kind === "theme" ? checkTheme(record) : kind === "layout" ? checkLayout(record) : checkBrand(record));

  const first = await saveFolderDraft({ root, files, community: "the-2-hour-club", call, check });
  expect(first).toMatchObject({ ok: true, saved: { theme: { draft_revision: 1 } } });
  expect(first.saved.layout).toBeUndefined();
  expect(await publishFolderDraft({ root, community: "the-2-hour-club", call })).toMatchObject({ theme: { draft_revision: 1 } });
  expect((server.theme.published as any).heading_case).toBe("upper");
  expect(server.layout.published).toBeNull();

  // Broken JSON and contract errors stop before Polynet is called.
  const before = calls.length;
  writeFileSync(files.theme, "{ not json");
  expect(await saveFolderDraft({ root, files, community: "the-2-hour-club", call, check })).toMatchObject({ ok: false });
  writeFileSync(files.theme, JSON.stringify({ version: 1, schemes: { light: { background: "#FFFFFF", surface: "#FFFFFF", text: "#EEEEEE",
    muted: "#999999", border: "#DDDDDD", accent: "#2F55FF", on_accent: "#FFFFFF", button: "#171719", on_button: "#FFFFFF" } } }));
  const refused = await saveFolderDraft({ root, files, community: "the-2-hour-club", call, check });
  expect(refused.ok).toBe(false);
  expect(JSON.stringify(refused.problems)).toContain("schemes.light.text");
  writeFileSync(files.theme, JSON.stringify({ version: 1, radius: 4 }));
  writeFileSync(files.layout, JSON.stringify({ version: 1, pages: { chat: { aside: ["leaderboard"] } } }));
  expect(JSON.stringify((await saveFolderDraft({ root, files, community: "the-2-hour-club", call, check })).problems)).toContain("layout");
  expect(calls.length).toBe(before);

  // Adding a layout saves and publishes it as its own record; the theme stays where it was.
  writeFileSync(files.layout, JSON.stringify({ version: 1, navigation: { position: "top" } }));
  expect(await saveFolderDraft({ root, files, community: "the-2-hour-club", call, check }))
    .toMatchObject({ ok: true, saved: { theme: { draft_revision: 2 }, layout: { draft_revision: 1 } } });
  await publishFolderDraft({ root, community: "the-2-hour-club", call });
  expect(server.layout.published).toMatchObject({ navigation: { position: "top" } });
  expect(server.theme.published).toMatchObject({ radius: 4 });

  // Someone else saves a newer theme draft: this folder's next save is refused, then pull catches up.
  server.theme.draft_revision = 5;
  await expect(saveFolderDraft({ root, files, community: "the-2-hour-club", call, check })).rejects.toThrow("theme_revision_conflict");
  const pulled = await pullDesign({ root, files, community: "the-2-hour-club", call });
  expect(Object.keys(pulled).sort()).toEqual(["layout", "theme"]);
  expect(await saveFolderDraft({ root, files, community: "the-2-hour-club", call, check }))
    .toMatchObject({ ok: true, saved: { theme: { draft_revision: 6 }, layout: { draft_revision: 2 } } });

  expect(draftPreviewUrl("https://www.polynet.ai/", "the-2-hour-club")).toBe("https://www.polynet.ai/c/the-2-hour-club?design=draft");
});

test("pull leaves a theme-only folder theme-only until the community has a layout of its own", async () => {
  const root = mkdtempSync(join(tmpdir(), "polynet-design-"));
  const files = designFiles(root);
  const { call } = fakeDesignServer();
  expect(Object.keys(await pullDesign({ root, files, community: "the-2-hour-club", call }))).toEqual(["theme"]);
  expect(existsSync(files.layout)).toBe(false);
});

function fakeDesignServer() {
  const server: Record<string, { draft: unknown; draft_revision: number; published: unknown }> = {
    theme: { draft: {}, draft_revision: 0, published: null },
    layout: { draft: {}, draft_revision: 0, published: null },
    brand: { draft: { version: 1 }, draft_revision: 0, published: null },
  };
  const calls: string[] = [];
  const call = async (tool: string, input: any) => {
    calls.push(input.operation ?? tool);
    if (tool === "polynet_read") {
      const kind = input.path.match(/builder\/(\w+)\.json$/)[1];
      return { body: JSON.stringify({ ...server[kind], contract: 1 }) };
    }
    const [, kind, step] = input.operation.match(/^community\.(\w+)\.(save_draft|save|publish)$/);
    if (input.input.expected_draft_revision !== server[kind].draft_revision) throw new Error(`${kind}_revision_conflict: The draft changed.`);
    if (step !== "publish") server[kind] = { ...server[kind], draft: input.input[kind], draft_revision: server[kind].draft_revision + 1 };
    else server[kind] = { ...server[kind], published: server[kind].draft };
    return { result: { ...server[kind] } };
  };
  return { server, calls, call };
}

test("a layout template keeps the founder's own colours and fonts, and uses its theme only when there is none", async () => {
  const templatesDir = mkdtempSync(join(tmpdir(), "polynet-templates-"));
  mkdirSync(join(templatesDir, "feed"));
  writeFileSync(join(templatesDir, "feed", "template.json"), JSON.stringify({ name: "feed", contract: 1, apply: { layout: "replace", theme: "keep_existing" } }));
  writeFileSync(join(templatesDir, "feed", "theme.json"), JSON.stringify({ version: 1, radius: 2 }));
  writeFileSync(join(templatesDir, "feed", "layout.json"), JSON.stringify({ version: 1, nav: "top" }));
  const ours = { version: 1, radius: 14, heading_case: "upper" };

  // The folder already has a theme: only the layout arrives.
  const folder = mkdtempSync(join(tmpdir(), "polynet-design-"));
  writeFileSync(join(folder, "theme.json"), JSON.stringify(ours));
  expect(await initFromTemplate({ root: folder, template: "feed", templatesDir })).toMatchObject({ theme: "kept" });
  expect(JSON.parse(readFileSync(join(folder, "theme.json"), "utf8"))).toEqual(ours);
  expect(JSON.parse(readFileSync(join(folder, "layout.json"), "utf8"))).toEqual({ version: 1, nav: "top" });

  // An empty folder for a community with a published theme gets the community's theme.
  const call = async (_tool: string, input: any) => (input.path.endsWith("/brand.json")
    ? { body: JSON.stringify({ contract: 1, draft: { version: 1 }, draft_revision: 0, published: null }) }
    : { body: JSON.stringify({ contract: 1, draft: ours, draft_revision: 3, published: ours }) });
  const fresh = join(mkdtempSync(join(tmpdir(), "polynet-design-")), "c");
  expect(await initFromTemplate({ root: fresh, template: "feed", templatesDir, community: "the-2-hour-club", call })).toMatchObject({ theme: "community" });
  expect(JSON.parse(readFileSync(join(fresh, "theme.json"), "utf8"))).toEqual(ours);
  expect(JSON.parse(readFileSync(join(fresh, ".polynet", "design.json"), "utf8"))).toEqual({ community: "the-2-hour-club", revisions: { theme: 3 } });

  // A community with no theme yet starts from the template's.
  const none = async (_tool: string, _input: any) => ({ body: JSON.stringify({ contract: 1, draft: {}, draft_revision: 0, published: null }) });
  const blank = join(mkdtempSync(join(tmpdir(), "polynet-design-")), "c");
  expect(await initFromTemplate({ root: blank, template: "feed", templatesDir, community: "new-club", call: none })).toMatchObject({ theme: "template" });
  expect(JSON.parse(readFileSync(join(blank, "theme.json"), "utf8"))).toEqual({ version: 1, radius: 2 });
  expect(existsSync(join(blank, "layout.json"))).toBe(true);
});

test("a template starts from the community's brand: its colours and fonts, on the template's look", async () => {
  const fake = fakeDesignServer();
  const brand = { version: 1, words: ["calm", "sharp", "warm"], colours: [{ hex: "#C2410C", role: "primary" }, { hex: "#F5F0E8", role: "neutral" }],
    fonts: [{ name: "Inter", use: "both" }] };
  fake.server.brand = { draft: brand, draft_revision: 2, published: null };
  const root = join(mkdtempSync(join(tmpdir(), "polynet-design-")), "c");
  const chosen = await initFromTemplate({ root, template: "stopwatch", community: "the-2-hour-club", call: fake.call });
  expect(chosen.theme).toBe("brand");
  const files = designFiles(root);
  expect(JSON.parse(readFileSync(files.brand, "utf8"))).toEqual(brand);
  const theme = JSON.parse(readFileSync(files.theme, "utf8"));
  expect(normalizeCommunityTheme(theme)).toMatchObject({ ok: true });
  expect(JSON.stringify(theme)).not.toContain("#3FD15A");
  expect(checkThemeAgainstBrand(theme, brand)).toEqual([]);
  // The stopwatch green, kept by hand, is far from this brand: check warns, never fails.
  const green = JSON.parse(readFileSync(join(TEMPLATES_DIR, "stopwatch", "theme.json"), "utf8"));
  expect(checkThemeAgainstBrand(green, brand).every((problem: any) => problem.level === "warning")).toBe(true);
  expect(checkThemeAgainstBrand(green, brand).length).toBeGreaterThan(0);

  // The brand is saved with the folder but never published; members don't see it.
  const saved = await saveFolderDraft({ root, files, community: "the-2-hour-club", call: fake.call,
    check: (kind: string, record: unknown) => (kind === "theme" ? checkTheme(record) : kind === "brand" ? checkBrand(record) : checkLayout(record)) });
  expect(saved).toMatchObject({ ok: true, saved: { brand: { draft_revision: 3 }, theme: { draft_revision: 1 } } });
  const published = await publishFolderDraft({ root, community: "the-2-hour-club", call: fake.call });
  expect(Object.keys(published)).toEqual(["theme"]);
  expect(fake.calls).not.toContain("community.brand.publish");
});
