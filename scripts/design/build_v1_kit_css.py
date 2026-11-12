#!/usr/bin/env python3
"""Turn the hi-fi mock's stylesheet into the v1 kit's CSS Module.

The visual rules stay exactly the mock's. Only three mechanical changes:
  1. The mock switches state with hidden radio buttons (`:has(.v-home:checked)`).
     Each of those becomes a plain class on the kit's root that React sets
     (`.on-v-home`); the mock's default view (no radio checked) is `.on-v-home`.
  2. Rules that would reach outside the kit (`*`, `body`, bare element
     selectors such as `kbd`) are scoped under `.app`, the kit's root.
  3. The mock loads Geist and Newsreader from Google Fonts; the app ships the
     same faces as "Geist Variable" and "Newsreader Variable".
  4. The kit renders real buttons and inputs where the mock used labels and
     spans, so a reset with zero specificity (`:where()`) strips the browser's
     button styles. It can never outrank a rule from the mock.

Run: python3 scripts/design/build_v1_kit_css.py  (--stdout prints instead of writing)
Source: docs/design/hifi-mock/style.css  Output: apps/web/src/v1/kit.module.css
"""
import re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
src = (ROOT / "docs/design/hifi-mock/style.css").read_text()

def convert_selector(sel: str) -> str | None:
    s = sel.strip()
    if s == "body":
        return None
    if s == "*":
        return ".app, .app *"
    s = s.replace(":not(:has(input[name=v]:checked))", ".on-v-home")
    s = re.sub(r":has\(\.([\w-]+):checked\)", r".on-\1", s)
    s = re.sub(r":has\(input\[[^\]]*\]:checked\)", ".on-any", s)
    if ".app" not in s and not s.startswith(":root"):
        s = ".app " + s
    return s

def convert_block(text: str) -> str:
    out = []
    i = 0
    while i < len(text):
        brace = text.find("{", i)
        if brace == -1:
            out.append(text[i:]); break
        head = text[i:brace]
        # find matching close
        depth, j = 0, brace
        while True:
            if text[j] == "{": depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0: break
            j += 1
        body = text[brace + 1:j]
        h = head.strip()
        if h.startswith("@keyframes") or h.startswith("@font-face"):
            out.append(head + "{" + body + "}")
        elif h.startswith("@media") or h.startswith("@supports"):
            out.append(head + "{" + convert_block(body) + "}")
        else:
            sels = [convert_selector(x) for x in split_top(h)]
            sels = [x for x in sels if x]
            if sels:
                lead = head[: len(head) - len(head.lstrip())]
                out.append(lead + ",".join(sels) + "{" + body + "}")
        i = j + 1
    return "".join(out)

def split_top(s: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur); cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts

# Comments go first: left in, they glue onto the next selector.
css = convert_block(re.sub(r"/\*.*?\*/", "", src, flags=re.S))
css = css.replace("--sans:'Geist','Inter',system-ui,sans-serif", "--sans:'Geist Variable','Geist','Inter',system-ui,sans-serif")
css = css.replace("--serif:'Newsreader',Georgia,serif", "--serif:'Newsreader Variable','Newsreader',Georgia,serif")
css = css.replace("font-family:'Geist','Inter',sans-serif", "font-family:'Geist Variable','Geist','Inter',sans-serif")
css += """
/* Kit addition (see the script): browser defaults off, at zero specificity. */
:where(.app) :where(button){margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;line-height:inherit;letter-spacing:inherit;text-align:inherit;cursor:pointer}
:where(.app) :where(input,textarea){margin:0;font:inherit;color:inherit}
/* A button never stretches like the mock's block labels did; these do. */
:where(.app) :where(button.cover,button.row,button.item,button.me){width:-webkit-fill-available;width:stretch}

/* Kit addition: a part of the app (a page's middle, or its right column)
   inside the app's own frame, instead of the mock's whole 900px window. */
.app.part{min-width:0;width:100%;height:100%;background:transparent}
.app.part.rail-part{height:auto;min-height:100%;overflow:visible}
.app.part>.rail{width:auto;flex:1;border-left:0}
.app.part .scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.app.part .scroll>.home{padding-bottom:24px}
/* A part that flows inside the app's own scrolling box (a channel's feed):
   it sits at the bottom of the box, as the newest message should. */
.app.part.flow-part{height:auto;margin-top:auto;overflow:visible;display:block;flex:none}
.app.part.flow-part .feed{padding:0}
/* The banner card on its own in the app's left column; its menu may overflow. */
.app.part.cover-part{height:auto;display:block;overflow:visible;flex:none}
/* The reply box with a growing textarea where the mock has a one-line input. */
.app .ask textarea{flex:1;min-width:0;align-self:center;padding:12px 0;max-height:148px;resize:none;background:transparent;border:0;outline:0;color:var(--ink);font:inherit;font-size:15px;line-height:22px}
.app .ask textarea::placeholder{color:var(--ink3)}
.app .ask .send:not(:disabled){cursor:pointer}
.app .ask:focus-within .send:disabled{background:var(--s2);color:var(--ink3);box-shadow:none}

/* Kit addition: the live Members table (the mock draws it still). */
.app button.trow{width:100%;text-align:left;cursor:pointer}
.app button.trow:disabled{cursor:default}
.app .th-sort{display:flex;align-items:center;gap:4px;color:inherit;font:inherit}
.app .th-sort .ic{width:12px;height:12px;opacity:.7}
.app .find input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:var(--ink);font:inherit;font-size:13px}
.app .find input::placeholder{color:var(--ink3)}
.app .note-add{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.app .note-add textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:13px;line-height:1.45;resize:vertical;outline:0}
.app .note-add textarea:focus{border-color:var(--line2)}
.app .note-add textarea::placeholder{color:var(--ink3)}
.app .note-del{margin-left:8px;color:var(--ink3);font-size:12px;text-decoration:underline}
.app .lab .priv{float:right;font-style:normal;font-weight:400}
.app button.p{width:100%;text-align:left}
/* Knowledge in the app: the mock's map in a scrolling page, a plain list of
   notes under it, and the open note's text and forms in the right column. */
.app .kn-title{margin:0;font-family:var(--serif);font-weight:var(--serif-w);font-size:34px;letter-spacing:-.02em;line-height:1.1}
.app .kn-sub{margin:8px 0 0;font-size:13px;color:var(--ink2)}
.app svg.kn-map{display:block;width:100%;height:auto;margin:6px 0 0}
.app .kn-pt{cursor:pointer}
.app button.kn-row{width:100%;text-align:left;grid-template-columns:20px 1fr auto;cursor:pointer}
.app .kn-row.sel{background:var(--s2)}
.app .kn-dot{width:7px;height:7px;border-radius:50%;background:var(--ink3);justify-self:center}
.app .kn-dot.new{background:var(--aurora);box-shadow:0 0 10px var(--aurora)}
.app .kn-note-title{margin:2px 0 0;font-size:20px;font-weight:600;letter-spacing:-.015em}
.app .kn-body p{margin:0 0 10px;font-size:15px;line-height:1.55;color:var(--ink2)}
.app button.src{width:calc(100% + 20px);text-align:left}
.app .kn-form{display:flex;flex-direction:column;gap:10px}
.app .kn-form input,.app .kn-form textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:14px;line-height:1.5;outline:0;resize:vertical}
.app .kn-form input:focus,.app .kn-form textarea:focus{border-color:var(--line2)}
.app .kn-form input::placeholder,.app .kn-form textarea::placeholder{color:var(--ink3)}
.app .r2 .kick{display:flex}

/* Links drawn as the mock's buttons (Join, Add to calendar). */
.app a.btn{text-decoration:none}
.app .btn.sm.on .ic{width:13px;height:13px}

/* Kit addition: states the mock doesn't draw, in its own terms. */
.app .msg.cont{padding-top:3px;padding-bottom:3px}
.app .msg.cont>.gap{width:36px;flex:none}
.app .msg.pending{opacity:.6}
.app .msg.mention{background:rgba(29,155,240,.06)}
.app .tools:focus-within,.app .tools:has([aria-expanded="true"]){opacity:1;transform:none;pointer-events:auto}
.app .re.mine{border-color:rgba(29,155,240,.45);background:rgba(29,155,240,.10);color:var(--ink)}
/* Many reactions wrap onto more lines rather than run past the edge. */
.app .msg .rx{flex-wrap:wrap;row-gap:6px}
/* The app's own avatar (with its profile card) at the mock's 36px. */
.app .msg>:global(.community-interaction-avatar-hover),.app .msg>:global(.community-interaction-avatar-hover) :global(.community-interaction-avatar-trigger),.app .msg>:global(.community-interaction-avatar-hover) :global(.community-interaction-avatar){width:36px;height:36px;flex:none}

/* Decisions on top of the mock (Neil, Nov 10-11). The mock is drawn at 1440,
   where Home's text column is 736px. On wider windows that column stays 736px
   and centres in the middle, and the composer keeps the same edges. */
.app.part{--measure-gutter:max(56px,calc((100% - 736px) / 2))}
.app.part .home,.app.part .dock{padding-left:var(--measure-gutter);padding-right:var(--measure-gutter)}
/* In the app, pages and messages are just there, as a channel is: the mock's
   fade-and-rise belongs to its demo switching. Menus and the palette still pop. */
.app.part .view,.app.part .mine,.app.part .theirs,.app.part .c-done{animation:none}
"""
header = "/* Generated by scripts/design/build_v1_kit_css.py from docs/design/hifi-mock/style.css.\n   Do not edit by hand: change the mock, then run the script. */\n"
if "--stdout" in sys.argv:
    sys.stdout.write(header + css)
else:
    (ROOT / "apps/web/src/v1/kit.module.css").write_text(header + css)
    print("kit.module.css", len(css.splitlines()), "lines")
