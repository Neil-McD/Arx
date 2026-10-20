// A small, safe markdown renderer: it builds DOM nodes and never uses innerHTML,
// so text from Polynet can't inject markup. Supports paragraphs, line breaks,
// headings (#..###), lists (- and 1.), quotes (>), code (`x` and ``` blocks),
// **bold**, *italic*, [links](https://…) and bare https:// links.

function inline(text, parent) {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    const token = match[0];
    if (match[1]) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else if (match[2]) {
      const strong = document.createElement("strong");
      inline(token.slice(2, -2), strong);
      parent.append(strong);
    } else if (match[3]) {
      const em = document.createElement("em");
      inline(token.slice(1, -1), em);
      parent.append(em);
    } else {
      const link = document.createElement("a");
      const labelled = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      link.href = labelled ? labelled[2] : token;
      link.textContent = labelled ? labelled[1] : token;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      parent.append(link);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

export function renderMarkdown(source) {
  const root = document.createElement("div");
  root.className = "prose";
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith("```")) {
      const block = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) block.push(lines[i++]);
      i += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.join("\n");
      pre.append(code);
      root.append(pre);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const node = document.createElement(heading[1].length === 1 ? "h3" : heading[1].length === 2 ? "h4" : "h5");
      inline(heading[2], node);
      root.append(node);
      i += 1;
      continue;
    }
    const listMatch = /^(\s*)([-*]|\d+\.)\s+/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const item = document.createElement("li");
        inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""), item);
        list.append(item);
        i += 1;
      }
      root.append(list);
      continue;
    }
    if (line.startsWith(">")) {
      const quote = document.createElement("blockquote");
      const parts = [];
      while (i < lines.length && lines[i].startsWith(">")) parts.push(lines[i++].replace(/^>\s?/, ""));
      inline(parts.join(" "), quote);
      root.append(quote);
      continue;
    }
    const paragraph = document.createElement("p");
    const parts = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i])) parts.push(lines[i++]);
    parts.forEach((part, index) => {
      if (index) paragraph.append(document.createElement("br"));
      inline(part, paragraph);
    });
    root.append(paragraph);
  }
  return root;
}
