# Collect the collapsible <details> sections of a course page into one lesson
# (markdown with front matter), so "Go deeper" style asides aren't lost when a
# page is ported to Polynet resources.
#
#   python details_to_lesson.py <page.html> <out.md> "<title>" <order> "<summary>" "<intro>"
import re, sys
from bs4 import BeautifulSoup, NavigableString, Tag

page, out, title, order, summary, intro = sys.argv[1:7]
soup = BeautifulSoup(open(page, encoding="utf-8").read(), "html.parser")

def inline(n):
    if isinstance(n, NavigableString): return re.sub(r"\s+", " ", str(n))
    if not isinstance(n, Tag) or n.name in ("script", "style", "svg", "button"): return ""
    t = "".join(inline(c) for c in n.children)
    if n.name in ("strong", "b"): return f"**{t.strip()}**" if t.strip() else ""
    if n.name in ("em", "i"): return f"*{t.strip()}*" if t.strip() else ""
    if n.name == "code": return "`" + n.get_text() + "`"
    if n.name == "a" and n.get("href", "").startswith("http"): return f"[{t.strip()}]({n['href']})"
    return t

def blocks(el):
    out = []
    for c in el.children:
        if isinstance(c, NavigableString):
            if c.strip(): out.append(c.strip())
            continue
        if not isinstance(c, Tag) or c.name == "summary": continue
        if c.name in ("ul", "ol"):
            out.append("\n".join(("1. " if c.name == "ol" else "- ") + inline(li).strip() for li in c.find_all("li", recursive=False)))
        elif c.name == "pre": out.append("```\n" + c.get_text().strip("\n") + "\n```")
        elif c.name in ("p", "h3", "h4", "h5"):
            t = inline(c).strip()
            if t: out.append(("#### " if c.name.startswith("h") else "") + t)
        elif c.name == "table":
            rows = [[inline(x).strip() for x in tr.find_all(["th", "td"])] for tr in c.find_all("tr")]
            if rows: out.append("| " + " | ".join(rows[0]) + " |\n|" + "---|" * len(rows[0]) + "\n" + "\n".join("| " + " | ".join(r) + " |" for r in rows[1:]))
        else: out += blocks(c)
    return out

parts = ["### " + d.summary.get_text(" ", strip=True) + "\n\n" + "\n\n".join(blocks(d)) for d in soup.find_all("details") if d.summary]
open(out, "w", encoding="utf-8").write(f"---\ntitle: {title}\norder: {order}\ntype: lesson\nminutes: 6\nsummary: {summary}\n---\n{intro}\n\n" + "\n\n".join(parts) + "\n")
print(out, len(parts), "sections")
