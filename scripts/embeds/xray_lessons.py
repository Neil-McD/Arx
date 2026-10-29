# Put the X-Ray course's interactive parts back into its lesson markdown:
# a polynet-embed block for the live widget, then the widget's content written
# out in full (the port had kept only what was visible on first load).
import json, re, sys, os
CONTENT, DATA, MANIFEST = sys.argv[1:4]
d = json.load(open(DATA, encoding="utf-8")); man = {m["id"]: m for m in json.load(open(MANIFEST, encoding="utf-8"))}

def embed(wid):
    m = man[wid]
    return f"```polynet-embed\nsrc: embeds/xray/{wid}.html\ntitle: {m['title']}\nheight: {m['height']}\nfallback: {m['fallback']}\n```"

def cut(text, start, end):
    """Text before `start` and from `end` on; `end` None means to the end."""
    i = text.index(start)
    j = text.index(end, i) if end else len(text)
    return text[:i], text[j:]

def write(name, fn):
    p = os.path.join(CONTENT, name); t = open(p, encoding="utf-8").read(); t2 = fn(t)
    open(p, "w", encoding="utf-8").write(re.sub(r"\n{3,}", "\n\n", t2)); print(name, len(t), "->", len(t2))

def bizmap(t):
    a, b = cut(t, "### Explore Each Column", "**Think of it as a pipeline:**")
    cols = "\n\n".join(f"#### {c['label'].title()}\n\n{c['desc']}\n\n**Warning sign:** {c['look']}\n\n**Common examples:** {', '.join(c['examples'])}" for c in d["MAP_COLS"])
    return a + "### Explore Each Column\n\nClick any column in the map to see what belongs there and what warning signs to look for.\n\n" + embed("business-map") + "\n\n" + cols + "\n\n" + b

def bowtie(t):
    a, b = cut(t, "### The 7 Stages", "### Why This Changes Everything")
    st = "\n\n".join(f"#### {s['label']} ({s['phase'].title()})\n\n{s['desc']}\n\n**Common failure point:** {s['fail']}" for s in d["BOWTIE_STAGES"])
    return a + "### The 7 Stages\n\nClick any stage to learn what happens there and where businesses commonly fail.\n\n" + embed("bowtie") + "\n\n" + st + "\n\n" + b

def level3(t):
    t = t.replace("Tap each level to preview what it covers. You'll learn each one in detail over the next few lessons.",
                  "Tap each level to preview what it covers. You'll learn each one in detail over the next few lessons.\n\n" + embed("levels"))
    a, b = cut(t, "### Quick Preview", "### The Compounding Rule")
    def lines(txt):
        ls = [l.strip() for l in txt.splitlines() if l.strip()]
        return ls[:ls.index("The Compounding Rule")] if "The Compounding Rule" in ls else ls
    l2, l3 = lines(d["level3Views"][0]), lines(d["level3Views"][1])
    lanes = next(l for l in l2 if l.startswith("Lanes:"))
    pairs = l2[2:l2.index(lanes)]
    v2 = (f"#### {l2[0]}\n\n{l2[1]}\n\n| Activity | Who, and the signal |\n|---|---|\n"
          + "\n".join(f"| {pairs[i]} | {pairs[i+1]} |" for i in range(0, len(pairs) - 1, 2)) + f"\n\n{lanes}")
    steps = l3[3:-1]
    v3 = (f"#### {l3[0]}\n\n{l3[1]}\n\n**{l3[2]}**\n\n| Step | Tool | Time | Who |\n|---|---|---|---|\n"
          + "\n".join("| " + " | ".join(steps[i:i+4]) + " |" for i in range(0, len(steps) - 3, 4)) + f"\n\n{l3[-1]}")
    return a + "### Quick Preview\n\nToggle between Level 2 and Level 3 to get a feel for the difference. Don't worry about the details yet; you'll learn each type in depth over the next few lessons.\n\n" + embed("level3-drilldown") + "\n\n" + v2 + "\n\n" + v3 + "\n\n" + b

def annotations(t):
    t = t.replace("Click each type to see it highlighted in the example below.", "Click each type to see it highlighted in the example.\n\n" + embed("annotations"))
    a, b = cut(t, "### Example: Annotated Process", "### Why This Changes Everything")
    return a + b

def swimlanes(t):
    a, b = cut(t, "### Explore a Process", "### Spot the Pattern")
    out = []
    for key, p in d["SWIM_DATA"].items():
        rows = []
        for li, lane in enumerate(p["lanes"]):
            cells = []
            for pi in range(len(p["phases"])):
                items = [i["text"].replace("\n", " ") + (f" ({i['ann'].replace('-', ' ')})" if i.get("ann") else "") for i in p["items"] if i["lane"] == li and i["phase"] == pi]
                cells.append("; ".join(items) or "–")
            rows.append(f"| **{lane}** | " + " | ".join(cells) + " |")
        out.append(f"#### {p['title']}\n\n| | " + " | ".join(p["phases"]) + " |\n|---|" + "---|" * len(p["phases"]) + "\n" + "\n".join(rows))
    return a + "### Explore a Process\n\nPick a process to see an example swim lane. Click the signals to highlight patterns.\n\n" + embed("swimlanes") + "\n\n" + "\n\n".join(out) + "\n\n" + b.replace("Click a signal to highlight it in the diagram above.\n\n", "")

def asset_md(x):
    steps = lambda s: "\n".join(f"{i+1}. {v}" for i, v in enumerate(s))
    return (f"#### {x['num']}. {x['name']}\n\n{x['desc']}\n\n**Why it creates leverage:** {x['leverage']}\n\n"
            f"- **Green (remarkable):** {x['green']}\n- **Yellow:** {x['yellow']}\n- **Red:** {x['red']}\n\n"
            f"**Red to Yellow:**\n\n{steps(x['rty'])}\n\n**Yellow to Green:**\n\n{steps(x['ytg'])}\n\n"
            f"**Effort:** {x['effort']}\n\n**Connects to:** {x['deps']}")

def assetmap(t):
    # Polynet keeps a page body to 20,000 characters: the 24 assets written out
    # don't fit beside the explorer, so the last categories get a second lesson.
    a, b = cut(t, "### The 24 Assets", "**Next:**")
    by = {x["num"]: x for x in d["ASSETS"]}
    cat = lambda c: f"### {c['name']}\n\n" + "\n\n".join(asset_md(by[n]) for n in c["assets"])
    first, rest = d["CATEGORIES"][:4], d["CATEGORIES"][4:]
    head = a.split("---", 2)
    part2 = ("---" + head[1].replace("title: Asset Explorer", "title: Asset Explorer, part 2") + "---\n"
             + f"The rest of the 24 assets in full: {', '.join(c['name'] for c in rest)}.\n\n"
             + "\n\n".join(cat(c) for c in rest) + "\n\n" + b)
    open(os.path.join(CONTENT, "10-asset-map-part-2.md"), "w", encoding="utf-8").write(re.sub(r"\n{3,}", "\n\n", part2))
    return (a + "### The 24 Assets\n\n7 categories, 24 building blocks. Click any asset to explore it.\n\n" + embed("asset-map")
            + "\n\n### Explore Each Asset\n\nOne at a time: full criteria, effort, and connections.\n\n" + embed("asset-explorer") + "\n\n"
            + "\n\n".join(cat(c) for c in first) + "\n\nThe other categories continue in **Asset Explorer, part 2**.\n")

def score(t):
    a, b = cut(t, "### Example Scorecard", "**How this connects to your Roadmap:**")
    arch = {x["id"]: x["label"] for x in d["ARCHETYPES"]}
    cats = d["CATEGORIES"]
    head = "| Business type | " + " | ".join(c["name"].split(" (")[0] for c in cats) + " |\n|---|" + "---|" * len(cats)
    rows = "\n".join(f"| {arch[k]} | " + " | ".join(v[c["id"]].title() for c in cats) + " |" for k, v in d["TIERS"].items())
    return (a + "### Example Scorecard\n\nBelow is an interactive example. Pick your business type, score each asset Green, Yellow or Red, and click any asset card to see its full scoring criteria, action playbook (Red to Yellow and Yellow to Green steps) and how it connects to other assets. This is exactly what your AI-generated scorecard will look like.\n\n"
            + embed("asset-scorecard") + "\n\n#### How important each category is, by business type\n\n" + head + "\n" + rows
            + "\n\nThe full criteria and playbook for every asset are in the Asset Explorer lesson.\n\n" + b)

only = sys.argv[4:] or None
for name, fn in [("04-biz-map.md", bizmap), ("05-bowtie.md", bowtie), ("06-level3.md", level3), ("07-annotations.md", annotations), ("08-swimlanes.md", swimlanes), ("10-asset-map.md", assetmap), ("14-assets-score.md", score)]:
    if not only or name in only: write(name, fn)
