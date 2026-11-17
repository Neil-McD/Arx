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

# The block marked "frame" draws the mock's own window; the app draws its
# frame in design-v1.css, so the kit leaves it out.
src = re.sub(r"/\* frame:.*?/\* /frame \*/", "", src, flags=re.S)
# Comments go first: left in, they glue onto the next selector.
css = convert_block(re.sub(r"/\*.*?\*/", "", src, flags=re.S))
css = css.replace("--sans:'Geist','Inter',system-ui,sans-serif", "--sans:'Geist Variable','Geist','Inter',system-ui,sans-serif")
css = css.replace("--serif:'Newsreader',Georgia,serif", "--serif:'Newsreader Variable','Newsreader',Georgia,serif")
css = css.replace("font-family:'Geist','Inter',sans-serif", "font-family:'Geist Variable','Geist','Inter',sans-serif")
# The mock's sample course cover is a file beside the mock; the app has it in public/.
css = css.replace("url(./polynet-earth.webp)", "url(/design-lab/polynet-earth.webp)")
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
/* Knowledge in the app (the classroom): the mock's cards and rows as real
   buttons, the ask field as a button that opens the guide, the done circle's
   on state, and the note forms in the right column. */
.app button.kcourse,.app button.kcont,.app button.kl,.app button.src{width:100%;text-align:left}
.app button.src{width:calc(100% + 20px)}
.app button.kcont{display:block}
.app .kask-btn{width:100%;cursor:pointer;color:var(--ink3);font-size:14px}
.app .kask-btn span{flex:1;text-align:left}
.app .kdone{cursor:pointer}.app .kdone.is{background:var(--blue);border-color:var(--blue);color:var(--bg)}
.app .kl.d .ic{color:var(--ink2)}
.app .kcover{background-color:var(--s2)}
.app .kn-note-title{margin:2px 0 0;font-size:20px;font-weight:600;letter-spacing:-.015em}
.app .kn-body p{margin:0 0 10px;font-size:15px;line-height:1.55;color:var(--ink2)}
.app .kn-form{display:flex;flex-direction:column;gap:10px}
.app .kn-form input,.app .kn-form textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:14px;line-height:1.5;outline:0;resize:vertical}
.app .kn-form input:focus,.app .kn-form textarea:focus{border-color:var(--line2)}
.app .kn-form input::placeholder,.app .kn-form textarea::placeholder{color:var(--ink3)}
.app .r2 .kick{display:flex}
/* Editing a lesson where it is read: the outline's move buttons, the title
   as the lesson's own serif heading, the video slot above the text, and the
   bar with Cancel and Save. */
.app .kl-row{display:flex;align-items:center;gap:4px}
.app .kl-row>.kl{flex:1;min-width:0}
.app .kl-move{display:flex;gap:2px;opacity:0;transition:opacity .15s var(--ease)}
.app .kl-row:hover .kl-move,.app .kl-move:focus-within{opacity:1}
.app .kl-move button{width:22px;height:22px;border-radius:6px;color:var(--ink3);font-size:12px;cursor:pointer}
.app .kl-move button:hover:not(:disabled){background:var(--s2);color:var(--ink)}
.app .kl-move button:disabled{opacity:.3;cursor:default}
.app .kedit-title{display:block;width:100%;box-sizing:border-box;margin:6px 0 0;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font-family:var(--serif);font-weight:var(--serif-w);font-size:30px;letter-spacing:-.018em;line-height:1.15}
.app .kedit-title::placeholder{color:var(--ink3)}
.app .kedit-video{display:flex;align-items:center;gap:12px;margin-top:18px;padding:12px;border-radius:14px;border:1px dashed var(--line2);background:var(--s1)}
.app .kedit-video.has{border-style:solid}
.app .kedit-video>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.app .kedit-video input{width:100%;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:14px}
.app .kedit-video input::placeholder{color:var(--ink3)}
.app .kedit-thumb{flex:none;width:96px;height:54px;border-radius:8px;background:var(--s2) center/cover no-repeat}
.app .kedit-bar{position:sticky;bottom:0;display:flex;align-items:center;gap:8px;margin-top:16px;padding:12px 0;border-top:1px solid var(--line);background:var(--bg)}
.app .kedit-bar .btn:disabled{opacity:.4;cursor:default;box-shadow:none}
.app .kedit-pub{margin-right:8px;font-size:13px;color:var(--ink3)}

/* The command palette in the app: the mock's veil and card over the whole
   window, a real input in its query row, results that scroll, and rows that
   are buttons. */
.app.part.palette-part{position:fixed;inset:0;z-index:1000;width:auto;height:auto;display:block;overflow:visible;pointer-events:none}
.app.palette-part .veil{display:block;position:fixed;pointer-events:auto}
.app.palette-part .pal{position:fixed;top:min(136px,12vh);width:min(580px,calc(100vw - 32px));margin-left:calc(min(580px,calc(100vw - 32px)) / -2)}
.app .pal .q input{flex:1;min-width:0;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:16px}
.app .pal .q input::placeholder{color:var(--ink3)}
.app .pal .res{max-height:min(480px,62vh);overflow-y:auto;padding-bottom:6px}
.app .pal button.opt{width:100%;text-align:left;cursor:pointer}
.app .pal .opt-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .pal .opt-label b{font-weight:500;color:var(--ink)}
.app .pal .pal-mark{width:20px;height:20px;border-radius:6px;font-size:9px}

/* Home's right column. */
/* The guide's brief, the first part of a right panel (mock: Pods3Inside,
   Home3): a quiet aurora card, its label and age, a short summary, and the
   channels it came from. */
.app .brief{border:1px solid rgba(var(--au),.26);background:linear-gradient(180deg,rgba(var(--au),.09),rgba(var(--au),.03));border-radius:10px;padding:12px 14px 13px;display:flex;flex-direction:column;gap:8px}
.app .brief .gl{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;letter-spacing:.02em;color:var(--aurora-ink)}
.app .brief .gl .ic{width:13px;height:13px}
.app .brief .gl em{margin-left:auto;font-style:normal;font-weight:400;color:rgba(196,178,252,.6)}
.app .brief p{margin:0;font-size:13.5px;line-height:1.55;color:var(--ink)}
.app .brief-from{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px;color:var(--ink3)}
.app .brief-from button{color:inherit;cursor:pointer}.app .brief-from button:hover{color:var(--ink)}
.app .brief p.fold{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.app button.brief-more{align-self:flex-start;margin-top:-2px;font-size:12.5px;font-weight:500;color:var(--aurora-ink);cursor:pointer}
/* A right panel's parts (mock: "Right panels, second pass"). No dividers:
   parts are set apart by space (the rail's own gap) and type. Each is a
   small label, with a fact after it and an action on its right, then rows
   of one line that never wrap. */
.app .rz{display:flex;flex-direction:column;gap:6px;min-width:0}
.app .rz>.lab{display:flex;align-items:center;gap:8px;min-height:22px;margin-bottom:2px;font-size:11.5px;font-weight:500;letter-spacing:.01em;color:var(--ink3)}
.app .rz>.lab{white-space:nowrap}
.app .rz>.lab em{font-style:normal;font-weight:400;opacity:.8;min-width:0;overflow:hidden;text-overflow:ellipsis}
.app .rz>.lab em::before{content:"·";margin-right:8px}
.app .rz>.lab .la{margin-left:auto}
.app button.la,.app a.la{font-size:12px;font-weight:500;letter-spacing:0;color:var(--ink2);cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}
.app button.la:hover,.app a.la:hover{color:var(--ink)}
.app button.la.ico{width:22px;height:22px;justify-content:center;border-radius:6px;border:1px solid var(--line2)}
.app button.la.ico .ic{width:13px;height:13px}
.app .ln{display:flex;align-items:center;gap:9px;min-height:28px;min-width:0;font-size:13.5px;color:var(--ink);white-space:nowrap}
.app .ln>.t{min-width:0;overflow:hidden;text-overflow:ellipsis}
.app .ln>.t.dim{color:var(--ink3)}
.app .ln>em{margin-left:auto;padding-left:8px;font-style:normal;font-size:12.5px;color:var(--ink3);flex:none}
.app .ln>.la{margin-left:auto}
.app .ln>i.dot{width:6px;height:6px;border-radius:50%;background:rgb(var(--au));flex:none}
.app .ln>i.dot.amber{background:#e0a84f}
.app button.ln{width:100%;text-align:left;cursor:pointer}.app button.ln:hover>.t{text-decoration:underline;text-decoration-color:var(--line2);text-underline-offset:3px}
.app .ln .stack .av{box-shadow:0 0 0 2px var(--panel,var(--bg))}
/* The next thing to do: what, a small line under it, the way in on the right. */
.app .nx{display:flex;align-items:center;gap:12px;min-width:0}
.app .nx>div{min-width:0;display:flex;flex-direction:column;gap:1px}
.app .nx b{font-size:15px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .nx small{font-size:12.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .nx .btn{margin-left:auto;height:30px;padding:0 14px;border-radius:8px;flex:none;text-decoration:none}
/* What needs the host, first in the panel: one row and its two answers. */
.app .need{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink2)}
.app .need>.t{margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .need>.t b{font-weight:600;color:var(--ink)}
.app .need .btn{height:26px;padding:0 10px;font-size:12px}
.app .needs{display:flex;flex-direction:column;gap:6px}
/* What a panel keeps at its foot: things looked at rarely, opened in place. */
.app .railfoot{margin-top:auto;display:flex;gap:18px}
.app .railfoot button{font-size:12.5px;color:var(--ink3);cursor:pointer}.app .railfoot button:hover,.app .railfoot button[aria-expanded="true"]{color:var(--ink)}
/* A pod's landing page, the Pods page's right panel. */
.app .land{display:flex;flex-direction:column;gap:26px;flex:1;min-width:0;max-width:100%}
.app .land>*{min-width:0;max-width:100%}
.app .land header{overflow-wrap:anywhere}
/* A panel that keeps something at its foot fills the column's height. */
.app.part.rail-part:has(>.rail>.land),.app.part.rail-part:has(>.rail>.railfoot){display:flex;flex-direction:column}
.app.part.rail-part>.rail:has(>.land),.app.part.rail-part>.rail:has(>.railfoot){flex:1}
.app .land h2{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.app .land-p{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--ink2)}
.app .land .podget{margin:14px 0 0}
.app .joinbar{margin-top:auto;display:flex;flex-direction:column;gap:7px}
.app .joinbar .btn{height:40px;font-size:14px;border-radius:10px;justify-content:center}
.app .joinbar small{font-size:12px;color:var(--ink3);text-align:center}
/* The community brain (KitBrainMap): neurons and synapses. */
.app svg.brain{display:block;width:100%;height:auto;overflow:visible}
.app svg.brain-page{height:100%}
/* A panel's map is drawn in pixels: one loud thing (what is new), the rest quiet. */
.app svg.brain-panel .brain-fibre{stroke-width:1;stroke:rgba(var(--w),.26)}
.app svg.brain-panel .brain-spoke{stroke-width:.7;stroke:rgba(var(--w),.1)}
.app svg.brain-panel .brain-branch{stroke:rgba(var(--w),.13)}
.app svg.brain-panel .brain-arc{stroke-width:.6;stroke:rgba(var(--au),.18)}
.app svg.brain-panel .brain-lesson{stroke-width:1.1;stroke:rgba(var(--w),.55)}
.app svg.brain-panel .brain-lesson.done{stroke:none}
.app svg.brain-panel .brain-cell{stroke-width:.9;stroke:rgba(var(--w),.4)}
.app svg.brain-panel .brain-nucleus{fill:rgba(var(--w),.4)}
.app svg.brain-panel .brain-dot.taught{stroke-width:1}
.app svg.brain-panel .brain-core-ring{stroke-width:.8}
.app .brainmini{display:block;width:100%;padding:6px 0;margin:0 0 4px;border-radius:10px;text-align:center}
.app button.brainmini{cursor:pointer;transition:background .12s}
.app button.brainmini:hover{background:rgba(var(--w),.035)}
.app .brainmini svg.brain-panel{max-height:230px;margin:0 auto}
.app .braincap{display:block;margin:-2px 0 6px;text-align:center;font-size:11.5px;color:var(--ink3)}
.app .brain-glow-in{stop-color:rgb(var(--au));stop-opacity:.55}
.app .brain-mine-in{stop-color:#8a91e3;stop-opacity:.55}
.app .brain-glow-out{stop-color:rgb(var(--au));stop-opacity:0}
.app .brain-fibre{fill:none;stroke:rgba(var(--w),.36);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.app .brain-spoke{fill:none;stroke:rgba(var(--w),.2);stroke-width:1.2;stroke-linecap:round}
.app .brain-spoke.gap{stroke:rgba(224,168,79,.5)}
.app .brain-branch{fill:none;stroke:rgba(var(--w),.2);stroke-linecap:round}
.app .brain-arc{fill:none;stroke:rgba(var(--au),.28);stroke-width:.9;stroke-linecap:round}
.app .brain-arc.hot{stroke:rgba(var(--au),.75);stroke-width:1.3}
.app .brain-fibre.dim,.app .brain-spoke.dim{stroke:rgba(var(--w),.1)}
.app .brain-branch.dim,.app .brain-arc.dim{stroke:rgba(var(--w),.05)}
.app .brain-dot{fill:#8b8f98}
.app .brain-dot.fresh{fill:#c4b2fc}
.app .brain-dot.taught{fill:var(--bg);stroke:#aeb2ba;stroke-width:1.5}
.app .brain-dot.mine{fill:#8a91e3}
.app .brain-dot.dim{fill:#34363c;stroke:none}
.app .brain-lesson{fill:var(--bg);stroke:#aeb2ba;stroke-width:1.7}
.app .brain-lesson.done{fill:var(--ink);stroke:none}
.app .brain-lesson.mine{fill:#8a91e3;stroke:none}
.app .brain-lesson.dim{fill:var(--bg);stroke:#34363c}
.app .brain-cell{fill:var(--bg);stroke:var(--ink);stroke-width:1.6}
.app .brain-cell.other{stroke-dasharray:2.4 2.2;stroke:#aeb2ba}
.app .brain-cell.closed{stroke:#6b6e76;stroke-width:1.3}
.app .brain-cell.dim{stroke:#34363c}
.app .brain-cell.gap{stroke:#e0a84f}
.app .brain-nucleus{fill:var(--ink)}.app .brain-nucleus.dim{fill:#34363c}.app .brain-nucleus.gap{fill:#e0a84f}
.app .brain-membrane{fill:rgba(var(--w),.012);stroke:rgba(var(--w),.16);stroke-dasharray:1.5 4}
.app .brain-ring{fill:none;stroke:#fff;stroke-width:1.3}
.app .brain-core{fill:#fff}
.app .brain-core-ring{fill:none;stroke:rgba(var(--au),.5)}
.app .brain-hit{fill:transparent}
.app .brain-node.pickable{cursor:pointer;outline:none}
.app .brain-node.pickable:focus-visible .brain-hit{stroke:rgba(var(--w),.6);stroke-width:1}
.app svg.brain text{font-family:inherit}
.app .brain-center{font-size:14px;font-weight:600;fill:var(--ink)}
.app .brain-hub{font-size:14px;font-weight:600;fill:var(--ink)}
.app .brain-hub.dim{fill:rgba(var(--w),.4)}.app .brain-hub.gap{fill:#e0a84f}.app .brain-hub.closed{font-weight:400;fill:var(--ink3)}
.app .brain-gapnote{font-size:11.5px;fill:#e0a84f}
.app .brain-num{font-size:11px;fill:var(--ink3)}.app .brain-num.dim{fill:rgba(var(--w),.25)}
.app .brain-name{font-size:12.5px;fill:rgba(var(--w),.78)}
.app .brain-name.dim{fill:rgba(var(--w),.28)}.app .brain-name.on{fill:#fff;font-weight:600}
/* The brain as a page in Knowledge: its counts and readings, then the map filling the rest. */
.app .brainpage{position:relative;height:100%;min-height:420px;overflow:hidden}
.app .brainstage{position:absolute;inset:0;display:flex}
.app .brainbar{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:18px 56px 0;pointer-events:none}
.app .brainbar>*{pointer-events:auto}
.app .brainbar .sub{margin:0}
.app .seg{margin-left:auto;display:flex;background:var(--bg);padding:2px;border-radius:8px;border:1px solid var(--line2)}
.app .seg button{height:26px;padding:0 12px;border-radius:6px;font-size:12.5px;color:var(--ink2);cursor:pointer}
.app .seg button.on{background:rgba(var(--w),.09);color:var(--ink)}
.app .brainside{position:absolute;top:0;right:0;bottom:0;width:380px;max-width:100%;box-sizing:border-box;overflow-y:auto;overflow-x:hidden;padding:20px 24px 24px;background:var(--bg);border-left:1px solid var(--line2);display:flex;flex-direction:column;gap:14px;animation:brainside .18s ease-out}
@keyframes brainside{from{transform:translateX(24px)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.app .brainside{animation:none}}
.app .brainside .sub2{white-space:normal;line-height:1.45}
.app .brainside .acts{margin-top:2px;flex-wrap:wrap}
.app .brainside .podform select{width:100%}
.app .brainside .bad{margin:0;font-size:13px}
.app .brainside-x{align-self:flex-end;min-width:28px;height:28px;padding:0 8px;border-radius:8px;color:var(--ink3);font-size:15px;line-height:1;cursor:pointer}
.app .brainside-x:hover{color:var(--ink);background:rgba(var(--w),.07)}
@media (max-width:1023px){.app .brainside{width:100%;border-left:0}.app .brainside-x{align-self:flex-start;font-size:13px;padding:0}.app .brainbar{padding:14px 16px 0}.app .brainzoom{left:16px}}
.app .brainwrap{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden}
.app .brainwrap svg.brain-page{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;user-select:none;overflow:hidden}
.app .brainwrap svg.brain-page:active{cursor:grabbing}
.app .brainzoom{position:absolute;left:56px;bottom:20px;display:flex;gap:4px}
.app .brainzoom button{min-width:30px;height:30px;padding:0 9px;border-radius:8px;border:1px solid var(--line2);background:var(--bg);color:var(--ink2);font-size:13px;cursor:pointer}
.app .brainzoom button:hover{color:var(--ink)}
.app .brainzoom button:disabled{opacity:.4;cursor:default}
.app button.kmini-btn{width:100%;padding:0}.app button.kmini-btn:disabled{cursor:default}
.app .kmini+.kline{margin-top:10px}

/* Pods (docs/specs/pods-v0.md): one page of pod cards, and the new-pod form. */
.app .podgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:20px}
.app button.podcard{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:120px;padding:16px;border-radius:10px;border:1px solid var(--line2);background:var(--panel2,var(--s1));text-align:left;cursor:pointer;transition:border-color .15s var(--ease),background .15s var(--ease)}
.app button.podcard:hover{border-color:rgba(var(--w),.18);background:var(--s2)}
.app .podname{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:var(--ink)}
.app .podname .ic{width:15px;height:15px;color:var(--ink3)}
.app .podpurpose{font-size:13px;line-height:1.5;color:var(--ink2)}
.app .podmeta{margin-top:auto;font-size:12px;color:var(--ink3)}
.app button.podnew{align-items:center;justify-content:center;flex-direction:row;gap:8px;border-style:dashed;color:var(--ink3);font-size:13px}
.app .podform{display:flex;flex-direction:column;gap:10px;margin-top:16px;max-width:560px}
.app .podform input,.app .podform textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--line2);background:var(--field);color:var(--ink);font:inherit;font-size:14px;outline:0;resize:vertical}
.app .podform input:focus,.app .podform textarea:focus{border-color:rgba(var(--w),.2)}
.app .podask{font-size:12px;color:var(--accent,var(--blue))}
.app .podout{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:120px;padding:16px;border-radius:10px;border:1px solid var(--line2);background:var(--panel2,var(--s1))}
.app button.podout{text-align:left;cursor:pointer;transition:border-color .15s var(--ease),background .15s var(--ease)}
.app button.podout:hover{border-color:rgba(var(--w),.18);background:var(--s2)}
/* The pod picked: its pitch is in the right column. */
.app .podsel{border-color:var(--accent,var(--line2));box-shadow:inset 0 0 0 1px var(--accent,var(--line2))}
.app .podpage .acts{display:flex;flex-wrap:wrap;gap:8px}
/* The pitch in the right column: its width, smaller type, long words wrap. */
.app .podform-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.app .podform-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2);cursor:pointer}
.app .podform-check input{width:auto}
.app .podform-seats{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2)}
.app .podform-seats input{width:96px}
.app .podprice{font-size:13px;color:var(--ink);font-weight:500}
.app .podpage{display:flex;flex-direction:column;gap:14px;max-width:620px;margin-top:20px}
.app .podpage .podname{font-size:20px}
.app .podget{margin:4px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--ink)}
.app .podtag{margin-left:8px;font-size:11px;color:var(--ink3);border:1px solid var(--line2);border-radius:999px;padding:1px 7px;white-space:nowrap}
.app .podleave{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.app .podnote-body{margin:8px 0 6px;font-size:13px;line-height:1.55;color:var(--ink2)}
.app .podnote-body p{margin:0 0 8px}
.app .podform select{padding:7px 10px;border-radius:8px;border:1px solid var(--line2);background:var(--field);color:var(--ink);font:inherit;font-size:13px}
.app .podreq{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;font-size:13px;color:var(--ink)}
.app .podreq em{font-style:normal;color:var(--ink3)}
.app .podreq-acts{display:flex;gap:4px}

/* Links drawn as the mock's buttons (Join, Add to calendar). */
.app a.btn{text-decoration:none}
.app .btn.sm.on .ic{width:13px;height:13px}

/* Kit addition: Knowledge's one list of notes, files and links, and the
   row that adds to it in place (Nov 14 mock). */
.app .krows{margin-top:8px}
.app .krow{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:0 12px;align-items:center;min-height:48px;width:100%;text-align:left;border-top:1px solid var(--line);color:inherit}
.app .krows>.krow:first-child{border-top:0}
.app button.krow:hover .t b{text-decoration:underline;text-decoration-color:var(--line2)}
.app .krow .ic{width:16px;height:16px;color:var(--ink3)}
.app .krow .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink3);font-size:13px}
.app .krow .t b{font-size:13.5px;font-weight:550;color:var(--ink);margin-right:8px}
.app .krow .from{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--ink3);white-space:nowrap}
.app .krow.add .t{color:var(--ink2)}
.app .kadd{margin-top:10px;border:1px solid var(--line2);background:var(--panel2);border-radius:10px;padding:12px 10px 10px 14px}
.app .kadd textarea{display:block;width:100%;min-height:44px;padding:0;border:0;outline:0;resize:none;background:transparent;color:var(--ink);font:inherit;font-size:14.5px;line-height:1.5}
.app .kadd textarea::placeholder{color:var(--ink3)}
.app .khint{margin-top:8px;font-size:12.5px;color:var(--ink2)}
.app .kwait{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px;border-radius:8px;border:1px solid rgba(var(--au),.22);background:rgba(var(--au),.05)}
.app .kwait p{margin:0;font-size:13.5px;font-weight:500;line-height:1.4;color:var(--ink)}

/* Kit addition: Events (Nov 14 mock). The row that adds an event, the box it
   opens into, the question Cancel asks in the row, and the public switch. */
.app .evparts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;margin-top:12px;padding-right:4px}
.app .evparts label{display:flex;flex-direction:column;gap:4px;min-width:0}
.app .evparts label.wide{grid-column:1/-1}
.app .evparts label>span{font-size:12px;color:var(--ink3)}
.app .evparts input:not([type=checkbox]),.app .evparts select,.app .evparts textarea{width:100%;box-sizing:border-box;min-height:34px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:13.5px;line-height:1.5;outline:0;resize:vertical}
.app .evparts input:focus,.app .evparts select:focus,.app .evparts textarea:focus{border-color:var(--line2)}
.app .evparts input::placeholder{color:var(--ink3)}
.app .evswitch small{display:block;margin-top:2px;font-size:12px;color:var(--ink3)}
.app .everr{margin-top:10px;font-size:13px;color:var(--bad)}
.app .evdim{opacity:.5}
/* Events, Nov 16: what's next as a card, later and past as rows, and the
   panel that opens on a pick or holds the form. */
.app .evtop{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.app .evtop .btn{flex:none}
.app .evlead{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.app .evday{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;width:84px;height:84px;border-radius:10px;border:1px solid var(--line2);background:var(--s1)}
.app .evday b{font-size:30px;font-weight:600;line-height:1;letter-spacing:-.02em;color:var(--ink)}
.app .evday span{margin-top:5px;font-size:12px;color:var(--ink3)}
.app .evday.sm{width:48px;height:48px;border-radius:8px}.app .evday.sm b{font-size:17px}.app .evday.sm span{margin-top:2px;font-size:11px}
.app .evday.past{opacity:.55}
.app .evnext{display:grid;grid-template-columns:84px minmax(0,1fr);gap:0 22px;margin-top:10px;padding:22px 24px;border-radius:12px;border:1px solid var(--line2);background:var(--panel2,var(--s1))}
.app .evnext.on{border-color:rgba(var(--w),.28)}
.app .evnext h2{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin:6px 0 0;font-size:22px;font-weight:600;letter-spacing:-.012em;color:var(--ink)}
.app .evsoon{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:500;color:var(--aurora-ink)}
.app .evsoon i{width:6px;height:6px;border-radius:50%;background:var(--aurora-ink);box-shadow:0 0 0 4px rgba(var(--au),.18)}
.app .evnext-when{margin:6px 0 0;font-size:14.5px;color:var(--ink)}
.app .evnext-where{display:flex;align-items:center;gap:7px;margin:3px 0 0;font-size:13.5px;color:var(--ink3)}
.app .evnext-say{margin:12px 0 0;max-width:620px;font-size:14px;line-height:1.55;color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere}
.app .evnext-acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px}
.app .evnext-acts .btn{gap:6px}
.app .evtag{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:5px;border:1px solid var(--line2);font-size:11.5px;font-weight:500;letter-spacing:0;color:var(--ink2);white-space:nowrap}
.app .evtag.pod{border-color:rgba(var(--au),.4);color:var(--aurora-ink)}
.app .evtag.pub{border-color:rgba(95,211,141,.38);color:#7fdca4}
.app .evsect{display:flex;align-items:center;gap:8px;margin-top:30px}
.app .evsect em{font-style:normal;font-size:12px;color:var(--ink3);opacity:.8}
.app .evmore{display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:12.5px;color:var(--ink2);cursor:pointer}
.app .evmore:hover{color:var(--ink)}
.app .evrows{margin-top:8px}
.app .evrow{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:0 16px;align-items:center;width:calc(100% + 24px);min-height:68px;margin:0 -12px;padding:0 12px;border-radius:10px;text-align:left;cursor:pointer;position:relative}
.app .evrow+.evrow::before{content:"";position:absolute;left:12px;right:12px;top:0;height:1px;background:var(--line)}
.app .evrow:hover,.app .evrow.on{background:var(--s1)}.app .evrow.on{background:var(--s2)}
.app .evrow:hover::before,.app .evrow:hover+.evrow::before,.app .evrow.on::before,.app .evrow.on+.evrow::before{opacity:0}
.app .evrow-t{display:flex;flex-direction:column;min-width:0}
.app .evrow-t b{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-size:14.5px;font-weight:550;color:var(--ink)}
.app .evrow-t small{margin-top:2px;font-size:13px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .evrow-go{color:var(--ink3)}
.app .evquiet{margin-top:26px;padding:24px;border-radius:12px;border:1px dashed var(--line2)}
.app .evquiet h3{margin:0;font-size:17px;font-weight:600;color:var(--ink)}
.app .evquiet p{margin:6px 0 0;font-size:14px;color:var(--ink2)}
.app .evp{display:flex;flex-direction:column;gap:26px;flex:1;min-width:0;position:relative}
.app .evp header{padding-right:30px;overflow-wrap:anywhere}
.app .evp header .lab{font-size:11.5px;font-weight:500;color:var(--ink3)}
.app .evp h2{margin:6px 0 0;font-size:21px;font-weight:600;letter-spacing:-.012em;color:var(--ink)}
.app .evp-when{margin:8px 0 0;font-size:14.5px;color:var(--ink)}
.app .evp-also{margin:2px 0 0;font-size:12.5px;color:var(--ink3)}
.app .evp-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.app .evp-tags:empty{display:none}
.app .evp-say{margin:0;font-size:14px;line-height:1.55;color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere}
.app .evp-x{position:absolute;top:-4px;right:-6px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;color:var(--ink3);cursor:pointer}
.app .evp-x:hover{color:var(--ink);background:rgba(var(--w),.07)}
.app .evp .evswitch{margin-top:6px}
.app .evp-foot{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:8px}
.app .evp-foot .btn{height:36px;justify-content:center;gap:7px;font-size:13.5px}
.app .evp .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.app .evp-ask{display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:var(--ink)}
.app .evp-note{font-size:12px;color:var(--ink3)}
.app .evparts.one{grid-template-columns:minmax(0,1fr);margin-top:0;padding:0;border:0}
.app .evfield{display:flex;flex-direction:column;gap:4px;min-width:0}
.app .evfield>span{font-size:12px;color:var(--ink3)}
.app .evseg{display:flex;padding:2px;border-radius:8px;border:1px solid var(--line2)}
.app .evseg button{flex:1;height:28px;padding:0 6px;text-align:center;border-radius:6px;font-size:12.5px;color:var(--ink2);cursor:pointer;white-space:nowrap}
.app .evseg button.on{background:rgba(var(--w),.09);color:var(--ink)}
.app.part.rail-part:has(>.rail>.evp){display:flex;flex-direction:column}
.app.part.rail-part>.rail:has(>.evp){flex:1}
@media (max-width:700px){.app .evnext{grid-template-columns:60px minmax(0,1fr);gap:0 14px;padding:16px}.app .evnext .evday{width:60px;height:60px}.app .evnext .evday b{font-size:22px}.app .evnext h2{font-size:18px}.app .evnext-acts{grid-column:1/-1}.app .evnext-acts .btn{flex:1;height:38px;justify-content:center}.app .evtop{flex-wrap:wrap}}
:where(:root[data-layout="phone"]) .app .evnext{grid-template-columns:60px minmax(0,1fr);gap:0 14px;padding:16px}
:where(:root[data-layout="phone"]) .app .evnext .evday{width:60px;height:60px}:where(:root[data-layout="phone"]) .app .evnext .evday b{font-size:22px}
:where(:root[data-layout="phone"]) .app .evnext h2{font-size:18px}
:where(:root[data-layout="phone"]) .app .evnext-acts{grid-column:1/-1}:where(:root[data-layout="phone"]) .app .evnext-acts .btn{flex:1;height:38px;justify-content:center}
.app .evswitch{display:flex;align-items:flex-start;gap:12px;font-size:13.5px}
.app .evswitch>span{flex:1;min-width:0}
.app .evsw{flex:none;position:relative;width:34px;height:20px;margin-top:1px;border-radius:10px;border:0;background:var(--s2);transition:background .16s var(--ease)}
.app .evsw i{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:var(--ink2);transition:left .16s var(--ease),background .16s var(--ease)}
.app .evsw.on{background:var(--go)}.app .evsw.on i{left:17px;background:#fff}
:where(:root[data-layout="phone"]) .app .evparts{grid-template-columns:minmax(0,1fr)}:where(:root[data-layout="phone"]) .app .evaddrow span{display:none}:where(:root[data-layout="phone"]) .app .erow{row-gap:8px}

/* Kit addition: the box a course's settings open in (KitCourseEdit), and a form's foot. */
.app .kaddbox{margin-top:20px;padding:14px 12px 12px 16px;border-color:rgba(var(--au),.45);box-shadow:0 0 0 4px rgba(var(--au),.08)}
.app .kaddbox textarea{font-size:15px;line-height:1.6;min-height:48px;max-height:260px;overflow-y:auto}
/* The channel's panel (KitChannelRail): what it is for, and its pinned post as a card. */
.app .chabout{margin:0;font-size:14px;line-height:1.5;color:var(--ink2);overflow-wrap:anywhere}
.app .chpin{display:flex;flex-direction:column;gap:6px;width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--line2);background:var(--s1);text-align:left;cursor:pointer;transition:border-color .12s}
.app .chpin:hover{border-color:rgba(var(--w),.22)}
.app .chpin-by{display:flex;align-items:center;gap:7px;min-width:0;font-size:12.5px;color:var(--ink3)}
.app .chpin-by svg{flex:none}
.app .chpin-by b{font-weight:550;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .chpin-by em{margin-left:auto;font-style:normal;white-space:nowrap}
.app .chpin strong{font-size:14px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.app .chpin-text{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;font-size:13.5px;line-height:1.5;color:var(--ink2);overflow-wrap:anywhere}
/* The members' directory fits the room it has: a profile open beside it
   narrows it, so it shows fewer across, never cut names. */
.app .page:has(>.ppl){container-type:inline-size}
@container (max-width:760px){.app .ppl{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container (max-width:480px){.app .ppl{grid-template-columns:minmax(0,1fr)}}
/* Members for the host (KitMembersTable): a toolbar, a bordered table with a
   box to tick on each row, what can be done to everyone ticked, and the
   people waiting to join in a drawer. */
.app .mwait{display:flex;align-items:center;gap:10px;width:100%;margin-top:16px;padding:10px 14px;border-radius:10px;border:1px solid var(--line2);background:var(--s1);font-size:14px;color:var(--ink);text-align:left;cursor:pointer}
.app .mwait:hover{border-color:rgba(var(--w),.2)}
.app .mwait span{flex:1;min-width:0}
.app .mwait em{font-style:normal;font-size:13px;color:var(--aurora-ink)}
.app .mbar{display:flex;align-items:center;gap:8px;margin-top:18px}
.app .msearch{display:flex;align-items:center;gap:8px;flex:0 1 320px;min-width:0;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--line2);background:var(--field);color:var(--ink3)}
.app .msearch:focus-within{border-color:rgba(var(--w),.22)}
.app .msearch input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:14px}
.app .msearch input::placeholder{color:var(--ink3)}
.app .msearch button{display:flex;color:var(--ink3);cursor:pointer}
.app .mbtn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 11px;border-radius:8px;border:1px solid var(--line2);font-size:13.5px;color:var(--ink2);cursor:pointer;white-space:nowrap}
.app .mbtn:hover{color:var(--ink);border-color:rgba(var(--w),.2)}
.app .mbtn.on{color:var(--ink);background:var(--s2)}
.app .mbtn:disabled{opacity:.5;cursor:default}
.app .mbtn.mclear{padding:0 8px;margin-left:-4px}
.app .mbtn.mexport{margin-left:auto}
.app .mfilter{position:relative;display:flex;align-items:center;gap:6px}
.app .mmenu{position:absolute;z-index:5;top:40px;left:0;min-width:220px;padding:5px;border-radius:10px;border:1px solid var(--line2);background:var(--panel2,var(--bg));box-shadow:0 12px 32px rgba(0,0,0,.35)}
.app .mmenu button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;height:32px;padding:0 10px;border-radius:7px;font-size:13.5px;color:var(--ink2);text-align:left;cursor:pointer}
.app .mmenu button:hover,.app .mmenu button[aria-selected="true"]{background:var(--s2);color:var(--ink)}
.app .mmenu em{font-style:normal;font-size:12.5px;color:var(--ink3)}
/* The bulk bar floats at the foot of the page, so ticking someone never moves the rows. */
.app .mbulk{position:sticky;z-index:4;bottom:16px;display:flex;align-items:center;flex-wrap:wrap;gap:8px;width:fit-content;max-width:100%;margin:14px auto 0;padding:8px 10px 8px 16px;border-radius:12px;border:1px solid rgba(var(--au),.45);background:var(--panel2,var(--bg));box-shadow:0 10px 30px rgba(0,0,0,.45)}
.app .mbulk b{margin-right:6px;font-size:13.5px;font-weight:550;color:var(--ink)}
.app .mtbl{margin-top:12px;border:1px solid var(--line2);border-radius:12px;overflow:hidden;container-type:inline-size}
.app .mrow2{display:grid;grid-template-columns:20px minmax(150px,1.7fr) 116px minmax(0,.9fr) 92px 108px 16px;gap:0 16px;align-items:center;min-height:58px;padding:0 16px;font-size:13.5px;color:var(--ink2);cursor:pointer;outline:0}
.app .mrow2+.mrow2{border-top:1px solid var(--line)}
.app .mrow2:not(.mhead):hover,.app .mrow2:focus-visible{background:var(--s1)}
.app .mrow2.sel,.app .mrow2.tick{background:var(--s2)}
.app .mrow2.mhead{min-height:40px;font-size:12.5px;font-weight:500;color:var(--ink3);background:var(--s1);cursor:default}
.app .mrow2>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .mth{display:inline-flex;align-items:center;gap:5px;font:inherit;color:inherit;text-align:left}
.app button.mth{cursor:pointer}.app button.mth:hover{color:var(--ink)}
.app .mth i{font-style:normal;font-size:11px}
.app .mwho{display:flex;align-items:center;gap:11px}
.app .mwho>span:last-child{display:flex;flex-direction:column;min-width:0}
.app .mwho b{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:550;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .mwho small{font-size:12.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis}
.app .mstat{display:inline-flex;align-items:center;gap:7px}
.app .mstat i{width:6px;height:6px;border-radius:50%;background:var(--ink3);flex:none}
.app .mstat.active{color:#5fd38d}.app .mstat.active i{background:#5fd38d}
.app .mstat.on_hold{color:#e0a84f}.app .mstat.on_hold i{background:#e0a84f}
.app .mstat.cancelling{color:var(--ink2)}
.app .mstat.comped{color:var(--aurora-ink)}.app .mstat.comped i{background:var(--aurora-ink)}
.app .mchev{color:var(--ink3)}
.app .mtick{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;border:1.5px solid rgba(var(--w),.3);color:#fff;cursor:pointer}
.app .mtick:hover{border-color:rgba(var(--w),.6)}
.app .mtick.on{background:#6e79d6;border-color:#6e79d6}
.app .mtick i{width:8px;height:2px;border-radius:1px;background:#fff}
.app .mnone{margin:0;padding:18px 16px;font-size:13.5px;color:var(--ink3)}
.app .tbl.mpast{margin:12px 0 0;border:1px solid var(--line2);border-radius:12px;overflow:hidden}
/* The drawer scrolls on its own: any number of people can be waiting. */
.app .mdrawer{display:flex;flex-direction:column;gap:18px;box-sizing:border-box;height:100%;max-height:100vh;padding:20px 24px 24px;min-width:0;overflow-y:auto}
.app .mdrawer>*{flex:none}
.app .mdrawer header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.app .mdrawer h2{margin:4px 0 0;font-size:20px;font-weight:600;color:var(--ink)}
.app .mdrawer .lab{font-size:11.5px;color:var(--ink3)}
.app .mx{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;color:var(--ink3);cursor:pointer}
.app .mx:hover{color:var(--ink);background:rgba(var(--w),.07)}
.app .mreq{display:flex;gap:12px;padding-top:16px;border-top:1px solid var(--line)}
.app .mreq>div{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.app .mreq b{font-size:14px;font-weight:550;color:var(--ink)}
.app .mreq small{font-size:12.5px;color:var(--ink3)}
.app .mreq p{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:var(--ink2);overflow-wrap:anywhere}
.app .mreq-acts{display:flex;gap:6px;margin-top:10px}
/* The table fits the room it has (a record open beside it narrows it): it
   lets go of Joined, then Plan, then Last active, never the member. */
@container (max-width:760px){.app .mrow2{grid-template-columns:20px minmax(150px,1.7fr) 116px minmax(0,.9fr) 108px 16px}.app .mrow2>:nth-child(5){display:none}}
@container (max-width:620px){.app .mrow2{grid-template-columns:20px minmax(150px,1fr) 116px 108px 16px}.app .mrow2>:nth-child(4){display:none}}
@container (max-width:480px){.app .mrow2{grid-template-columns:20px minmax(0,1fr) max-content 16px;gap:0 12px;padding:0 12px}.app .mrow2>:nth-child(6){display:none}}
@media (max-width:820px){.app .mrow2{grid-template-columns:20px minmax(0,1fr) max-content 16px;gap:0 12px;padding:0 12px}.app .mrow2>:nth-child(4),.app .mrow2>:nth-child(5),.app .mrow2>:nth-child(6){display:none}.app .msearch{flex:1}}
:where(:root[data-layout="phone"]) .app .mrow2{grid-template-columns:20px minmax(0,1fr) max-content 16px;gap:0 12px;padding:0 12px}
:where(:root[data-layout="phone"]) .app .mrow2>:nth-child(4),:where(:root[data-layout="phone"]) .app .mrow2>:nth-child(5),:where(:root[data-layout="phone"]) .app .mrow2>:nth-child(6){display:none}
/* Knowledge: adding by buttons, and the short forms they open (a link, a course's name). */
.app .kbtns{margin-top:14px}
.app .kbtns-row{display:flex;flex-wrap:wrap;gap:8px}
.app .kbtns-link{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.app .kbtns-link input{flex:1;min-width:200px;max-width:440px;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--line2);background:var(--field);color:var(--ink);font:inherit;font-size:14px;outline:0}
.app .kbtns-link input:focus{border-color:rgba(var(--w),.2)}

/* A right column drawn as a part of a page takes the room the page gives it
   (the app's column narrows in a smaller window; the mock's fixed width ran
   past its edge), and its lines and buttons wrap. */
.app.part.rail-part .rail{width:100%;box-sizing:border-box;min-width:0}
.app.part.rail-part .rail .sub2{white-space:normal}
.app.part.rail-part .rail .acts{flex-wrap:wrap;row-gap:6px}

/* Kit addition: a lesson's resources (links members open), under the lesson
   and in its editor. */
.app .kres{display:flex;flex-direction:column;gap:2px;margin-top:26px}
.app .kres>.lab{margin-bottom:6px}
.app .kres>.sub{margin-top:8px;font-size:12.5px;color:var(--ink3)}
.app .kresrow{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:0 12px;align-items:center;min-height:44px;border-top:1px solid var(--line);color:inherit;text-decoration:none}
.app .kres>.lab+.kresrow{border-top:0}
.app .kresrow .ic{width:16px;height:16px;color:var(--ink3)}
.app .kresrow span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}
.app .kresrow b{font-weight:550;margin-right:8px}
.app .kresrow em{font-style:normal;font-size:12px;color:var(--ink3)}
.app a.kresrow.klink:hover b{text-decoration:underline;text-decoration-color:var(--line2)}
.app .kresadd{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;gap:8px;margin-top:8px}
.app .kresadd input{min-width:0;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:13.5px;outline:0}
.app .kresadd input:focus{border-color:var(--line2)}
.app .kresadd input::placeholder{color:var(--ink3)}
.app .krow .from .btn.sm{height:24px;padding:0 8px;font-size:12px}
.app .kedit-bar{flex-wrap:wrap;row-gap:8px}
.app .kedit-pub{white-space:nowrap}
:where(:root[data-layout="phone"]) .app .kresadd{grid-template-columns:minmax(0,1fr)}

/* Kit addition: arranging the shelf (two arrows on each book) and moving a
   lesson to another course from its editor. */
.app .kcourse.karr{position:relative;cursor:default}
.app .kcourse.karr:hover{border-color:var(--line);background:var(--s1)}
.app .kmove{position:absolute;top:8px;right:8px;display:flex;gap:4px}
.app .kmove button{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;border:1px solid var(--line2);background:var(--pop);color:var(--ink)}
.app .kmove button:disabled{opacity:.35}
.app .kmove button .ic{width:14px;height:14px}
.app .kmoveto{height:28px;max-width:220px;padding:0 8px;border-radius:6px;border:1px solid var(--line2);background:transparent;color:var(--ink2);font:inherit;font-size:12.5px}

/* Kit addition: changing a course in the page (KitCourseEdit): the cover on
   the left, the words on the right. */
.app .kcedit{margin-top:0;margin-bottom:22px}
.app .kcgrid{display:grid;grid-template-columns:200px minmax(0,1fr);gap:14px;margin-top:12px}
.app .kcthumb{height:112px;border-radius:8px;border:1px solid var(--line2);background:var(--s2) center/cover no-repeat;display:grid;place-items:center;color:var(--ink3)}
.app .kcbtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
:where(:root[data-layout="phone"]) .app .kcgrid{grid-template-columns:minmax(0,1fr)}

/* Kit addition: the app's own "are you sure?" (KitConfirm), in the palette's
   layer: a light veil and one small card. */
.app.palette-part .veil.askveil{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(0,0,0,.32)}
.app .askcard{position:fixed;left:50%;top:min(180px,22vh);width:min(380px,calc(100vw - 32px));transform:translateX(-50%);padding:18px 18px 14px;border-radius:12px;border:1px solid var(--line2);background:var(--pop);box-shadow:var(--pop-shadow);animation:pop .2s var(--ease) both}
.app .askcard p{margin:0;font-size:14.5px;line-height:1.5;color:var(--ink)}
.app .askacts{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.app .askacts .btn.no{color:var(--bad);border-color:var(--bad-line)}
.app .askacts .btn:focus-visible{outline:0;border-color:rgba(var(--w),.34);background:var(--s2)}

/* Kit addition: an Inbox row is two lines (Nov 14 walk): who and where, then
   what was said. Each is cut at the end of its line, never wrapped. */
.app .mrow.one>div{min-width:0}
.app .mrow.one .h{flex-wrap:nowrap}
.app .mrow.one .h b{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .mrow.one .h span{flex:0 9999 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .mrow.one .h time{flex:none;white-space:nowrap}
.app .mrow.one p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* Kit addition: the shelf is two courses across at every width (Nov 14 walk:
   never one course stretched over the whole page), one only where two would
   each be under 150px. */
.app .kgrid{grid-template-columns:repeat(auto-fill,minmax(max(150px,calc((100% - 12px) / 2)),1fr))}

/* Kit addition: an event you picked, where there is no right column (below
   1024px): the column's parts, in the page. */
.app .evlayer{display:flex;flex-direction:column;gap:26px;margin-top:14px;max-width:560px}

/* Kit addition: states the mock doesn't draw, in its own terms. */
.app .msg.cont{padding-top:3px;padding-bottom:3px}
.app .msg.cont>.gap{width:36px;flex:none}
.app .msg.pending{opacity:.6}
.app .msg.mention{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.app .tools:focus-within,.app .tools:has([aria-expanded="true"]){opacity:1;transform:none;pointer-events:auto}
.app .re.mine{border-color:color-mix(in srgb,var(--accent) 50%,transparent);background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--v1-accent-ink,var(--ink))}
.app .re.mine:hover{border-color:color-mix(in srgb,var(--accent) 70%,transparent);background:color-mix(in srgb,var(--accent) 20%,transparent)}
.app .th b{color:var(--v1-accent-ink,var(--accent));font-weight:500}
.app:is(.light:not(.on-mode-dark),.on-mode-light) .re.mine{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--v1-accent-ink,var(--ink))}
.app:is(.light:not(.on-mode-dark),.on-mode-light) .re.mine:hover{background:color-mix(in srgb,var(--accent) 20%,transparent)}
.app .klesson p{color:var(--ink1)}
.app .kedit-title{font-family:inherit;font-weight:600;font-size:30px;line-height:1.15;letter-spacing:-.02em}
.app .kswitch{display:inline-flex;align-items:center;gap:9px;height:32px;padding:0 12px 0 10px;border-radius:8px;border:1px solid var(--line2);font-size:13px;font-weight:500;cursor:pointer}
.app .kswitch i{position:relative;flex:none;width:28px;height:16px;border-radius:8px;background:var(--line2)}
.app .kswitch i::after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:var(--ink2);transition:left .16s var(--ease)}
.app .kswitch.on i{background:#3fb76b}.app .kswitch.on i::after{left:14px;background:#fff}
.app .kswitch small{font-size:12px;font-weight:400;color:var(--ink3)}
.app .kswitch:disabled{opacity:.5;cursor:default}
.app .kl-row{position:relative}
.app .kl-menu summary{display:grid;place-items:center;width:26px;height:26px;border-radius:6px;color:var(--ink3);cursor:pointer;list-style:none;opacity:0;transition:opacity .15s var(--ease)}
.app .kl-menu summary::-webkit-details-marker{display:none}
.app .kl-menu summary .ic{width:15px;height:15px}
.app .kl-row:hover .kl-menu summary,.app .kl-menu[open] summary,.app .kl-menu summary:focus-visible{opacity:1}
.app .kl-menu summary:hover{background:var(--s2);color:var(--ink)}
.app .kl-menu>div{position:absolute;right:4px;top:calc(100% - 2px);z-index:30;min-width:220px;padding:6px;border-radius:10px;background:var(--pop);border:1px solid var(--line2);box-shadow:0 18px 40px -18px rgba(0,0,0,.6)}
.app .kl-menu>div button{display:block;width:100%;padding:8px 10px;border-radius:7px;font-size:13.5px;text-align:left;cursor:pointer}
.app .kl-menu>div button:hover:not(:disabled){background:var(--s2)}
.app .kl-menu>div button:disabled{opacity:.4;cursor:default}
.app .kl-menu>div button.no{color:var(--bad)}
.app .klist:has(.kl-menu[open]){overflow:visible}
.app .kinline{display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-width:0}
.app .kinline-name,.app .kinline-about{max-width:100%;padding:1px 4px;margin:-1px -4px;border-radius:5px;text-align:left;cursor:text;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .kinline-name{font-size:14.5px;font-weight:600;line-height:1.25}
.app .kinline-about{font-size:12.5px;color:var(--ink2)}.app .kinline-about.empty{color:var(--ink3)}
.app .kinline-name:hover,.app .kinline-about:hover{background:var(--s2)}
.app .kinline em{font-style:normal;font-size:12px;color:var(--ink3)}
.app .kinline-input{width:100%;padding:1px 4px;margin:-1px -4px;border:0;border-radius:5px;outline:0;box-shadow:inset 0 0 0 1.5px var(--accent);background:transparent;color:var(--ink);font:inherit;font-size:13.5px}
.app .kinline-cover{padding:0;border:0;cursor:pointer;transition:filter .16s var(--ease)}.app .kinline-cover:hover{filter:brightness(1.2)}
.app .kedit-video.zone{margin-top:0;min-height:112px;padding:20px;cursor:text}
.app .kedit-video.zone input{flex:1;min-width:0}
.app .kedit-videorow{display:flex;align-items:center;gap:6px}
.app .kunsaved{position:sticky;bottom:16px;z-index:5;align-self:center;display:flex;align-items:center;gap:10px;margin-top:24px;padding:8px 8px 8px 16px;border-radius:14px;background:var(--pop);border:1px solid var(--line2);box-shadow:0 24px 50px -18px rgba(0,0,0,.7);font-size:13.5px}
.app .kunsaved i{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.app .kunsaved span{margin-right:8px}
.app .kunsaved .btn:disabled{opacity:.4;cursor:default}
.app .btn.lg{height:40px;padding:0 16px;border-radius:10px;font-size:14px}
.app .tag.live::before{content:"";width:6px;height:6px;margin-right:6px;border-radius:50%;background:#3fb76b}
.app .khero{display:grid;grid-template-columns:minmax(0,460px) minmax(0,1fr);gap:32px;align-items:center;width:100%;margin-top:18px;padding:20px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);box-shadow:0 18px 40px -26px rgba(0,0,0,.5);text-align:left;cursor:pointer;transition:border-color .16s var(--ease)}
.app .khero:hover{border-color:var(--line2)}
.app .khero-cover{display:grid;place-items:center;aspect-ratio:16/9;height:auto;border-radius:10px;color:var(--ink3)}
.app .khero-cover .ic{width:28px;height:28px}
.app .khero-body{display:flex;flex-direction:column;min-width:0}
.app .khero-eye{font-size:12.5px;font-weight:500;color:var(--v1-accent-ink,var(--accent))}
.app .khero-body>b{margin-top:6px;font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.12}
.app .khero-body>.s{margin-top:8px;max-width:46ch;font-size:15px;line-height:1.5;color:var(--ink2)}
.app .khero-next{display:flex;align-items:center;gap:12px;margin-top:18px;padding:10px 12px;border-radius:10px;background:var(--panel);border:1px solid var(--line)}
.app .khero-next i{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1.5px solid var(--accent);font-style:normal;font-size:12.5px;font-weight:600}
.app .khero-next b{display:block;font-size:14.5px;font-weight:550}.app .khero-next em{font-style:normal;font-size:12.5px;color:var(--ink3)}
.app .khero-prog{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:12.5px;color:var(--ink3)}
.app .khero-prog .kbar{flex:1;max-width:220px;margin-top:0}
.app .khero .acts{margin-top:18px}
.app .knum{margin-right:8px;font-style:normal;font-size:12.5px;font-weight:500;color:var(--ink3);font-variant-numeric:tabular-nums}
@media (max-width:760px){.app .khero{grid-template-columns:minmax(0,1fr);gap:16px;padding:12px 12px 16px}.app .khero-body>b{font-size:24px}}
.app .kcols{display:flex;gap:40px;max-width:860px;margin:22px auto 0;align-items:flex-start}
.app .kcols.two{max-width:1216px}
.app .kcols .kmainc{flex:1;min-width:0}
.app .kcols .klesson,.app .kcols .kcrumb{max-width:none;margin:0}
.app .klist{position:sticky;top:8px;flex:none;width:304px;max-height:calc(100vh - 150px);overflow-y:auto;border-radius:14px;background:var(--panel2);border:1px solid var(--line);box-shadow:0 18px 40px -26px rgba(0,0,0,.5)}
.app .klist-top{display:grid;grid-template-columns:72px minmax(0,1fr);gap:12px;align-items:center;padding:14px 14px 12px}
.app .klist-cover{display:grid;place-items:center;height:auto;aspect-ratio:16/9;border-radius:6px;color:var(--ink3)}
.app .klist-cover .ic{width:16px;height:16px}
.app .klist-top b{display:block;font-size:14.5px;font-weight:600;line-height:1.25}.app .klist-top em{font-style:normal;font-size:12.5px;color:var(--ink3)}
.app .klist>.kbar{margin:0 14px 10px}
.app .kbar{margin-top:8px}.app .kbar i{background:var(--accent)}
.app .klrows{padding:4px 6px 6px;border-top:1px solid var(--line)}
.app .kl{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;align-items:center;height:auto;min-height:38px;margin:0;padding:8px;border-radius:9px;font-size:14px;line-height:1.3;color:var(--ink2);text-align:left;cursor:pointer}
.app .kl:hover{background:var(--s2);color:var(--ink)}
.app .kl.d{color:var(--ink2)}
.app .kl.on{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--ink);font-weight:550}
.app .kdot{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line2)}
.app .kdot.now{border-color:var(--accent)}.app .kdot.now::after{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent)}
.app .kdot.done{border-color:transparent;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--v1-accent-ink,var(--accent))}
.app .kl .kdot .ic{width:11px;height:11px;stroke-width:2.4;color:inherit}
.app .klist-foot{display:flex;align-items:center;gap:9px;width:100%;padding:12px 14px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink2);cursor:pointer}
.app .klist-foot:hover{background:var(--s2);color:var(--ink)}
.app .klist-foot .ic{width:15px;height:15px;color:var(--ink3)}.app .klist-foot.guide .ic{color:var(--aurora)}
.app .kfold{margin-bottom:12px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)}
.app .kfold summary{display:flex;align-items:center;gap:10px;padding:12px 14px;font-weight:550;cursor:pointer;list-style:none}
.app .kfold summary::-webkit-details-marker{display:none}
.app .kfold summary em{margin-left:auto;font-style:normal;font-weight:400;font-size:12.5px;color:var(--ink3)}
.app .ktools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:1216px;margin:14px auto 0}
.app .ktools.head{width:100%;max-width:1216px;margin:0 auto;justify-content:flex-end;flex-wrap:nowrap}
.app .ktools .btn .ic{width:14px;height:14px}
.app .kmore{position:relative}
.app .kmore summary{list-style:none;cursor:pointer;width:32px;padding:0;justify-content:center}
.app .kmore summary::-webkit-details-marker{display:none}
.app .kmore-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:240px;padding:6px;border-radius:10px;background:var(--pop);border:1px solid var(--line2);box-shadow:0 18px 40px -18px rgba(0,0,0,.6)}
.app .kmore-menu button{display:block;width:100%;padding:8px 10px;border-radius:7px;font-size:13.5px;text-align:left;cursor:pointer}
.app .kmore-menu button:hover{background:var(--s2)}
.app .kmore-menu button.no{color:var(--bad)}
.app .kmore-menu small{display:block;margin-top:2px;font-size:12px;line-height:1.35;color:var(--ink3)}
.app .kfinish{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-top:34px;padding:16px 18px;border-radius:14px;background:var(--panel2);border:1px solid var(--line)}
.app .kfinish-next{flex:1;min-width:180px}
.app .kfinish.bare{padding:0;border:0;background:none}.app .kfinish.bare .kfinish-next{min-width:0}
.app .kfinish-next span{display:block;font-size:12.5px;color:var(--ink3)}
.app .kfinish-next b{display:block;margin-top:1px;font-size:15.5px;font-weight:600;line-height:1.3}
.app .kisdone{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;font-size:13px;color:var(--v1-accent-ink,var(--accent));cursor:pointer}
.app .kisdone .ic{width:14px;height:14px}.app .kisdone:hover{background:var(--s2)}
.app .kpct{height:auto;border-radius:0;background:none;overflow:visible}.app .kpct i{display:none}
.app .kpct em{padding:0;font-size:12px;font-weight:400;line-height:1.4;color:var(--ink3)}
.app .mine:not(.re){background:color-mix(in srgb,var(--accent) 26%,var(--panel2))}
.app:is(.light:not(.on-mode-dark),.on-mode-light) .mine:not(.re){background:color-mix(in srgb,var(--accent) 14%,#fff);color:var(--ink)}
.app .re.readd{padding:0 6px;color:var(--ink3);cursor:pointer}.app .re.readd:hover{color:var(--ink)}
.app .rx :global(.community-interaction-emoji-popover){right:auto;left:0}
/* Many reactions wrap onto more lines rather than run past the edge. */
.app .msg .rx{flex-wrap:wrap;row-gap:6px}
/* The app's own avatar (with its profile card) at the mock's 36px. */
.app .msg>:global(.community-interaction-avatar-hover),.app .msg>:global(.community-interaction-avatar-hover) :global(.community-interaction-avatar-trigger),.app .msg>:global(.community-interaction-avatar-hover) :global(.community-interaction-avatar){width:36px;height:36px;flex:none}

/* Decisions on top of the mock (Neil, Nov 10-11). The mock is drawn at 1440,
   where Home's text column is 736px. On wider windows that column stays 736px
   and centres in the middle, and the composer keeps the same edges. */
.app.part{--measure-gutter:max(56px,calc((100% - 736px) / 2))}
.app.part .home,.app.part .dock{padding-left:var(--measure-gutter);padding-right:var(--measure-gutter)}
/* Home's header bar names the page over the centred column. */
.app.part.on-v-home .top{padding-left:var(--measure-gutter);padding-right:var(--measure-gutter)}
/* In the app, pages and messages are just there, as a channel is: the mock's
   fade-and-rise belongs to its demo switching. Menus and the palette still pop. */
.app.part .view,.app.part .mine,.app.part .theirs,.app.part .c-done{animation:none}

/* On a phone (Neil, Nov 14 mock): the same pages on 16-20px gutters instead
   of the mock's 56px, every view shrinking to the screen, and rows of chips
   scrolling sideways rather than widening the page. */
:where(:root[data-layout="phone"]) .app .view,:where(:root[data-layout="phone"]) .app .scroll,:where(:root[data-layout="phone"]) .app .page,:where(:root[data-layout="phone"]) .app .home{min-width:0}
:where(:root[data-layout="phone"]) .app.part{--measure-gutter:20px}
:where(:root[data-layout="phone"]) .app .top,:where(:root[data-layout="phone"]) .app.part.on-v-home .top{padding-left:var(--kit-top-inset,16px);padding-right:16px}
:where(:root[data-layout="phone"]) .app .page{padding-left:16px;padding-right:16px}
:where(:root[data-layout="phone"]) .app .home,:where(:root[data-layout="phone"]) .app.part .home{padding-left:20px;padding-right:20px}
:where(:root[data-layout="phone"]) .app .dock,:where(:root[data-layout="phone"]) .app.part .dock{padding-left:12px;padding-right:12px;padding-bottom:12px}
:where(:root[data-layout="phone"]) .app .chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
:where(:root[data-layout="phone"]) .app .chips::-webkit-scrollbar{display:none}
:where(:root[data-layout="phone"]) .app .chips>*{flex:none}
:where(:root[data-layout="phone"]) .app .filters{flex-wrap:wrap}
.app .grp.has-act{display:flex;align-items:center;justify-content:space-between}
.app .grp-add{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--ink3)}
.app .grp-add svg{width:15px;height:15px}
:where(:root[data-layout="phone"]) .app .mrow .h{flex-wrap:wrap;row-gap:0}
:where(:root[data-layout="phone"]) .app .mrow .h b{flex:none;white-space:nowrap}
:where(:root[data-layout="phone"]) .app .trow{grid-template-columns:28px minmax(0,1fr) auto auto;gap:0 12px}
:where(:root[data-layout="phone"]) .app .trow>:nth-child(3){display:none}
.app .disc{max-width:1120px}
.app .discgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.app .disccard{display:flex;flex-direction:column;text-align:left;padding:0;overflow:hidden;border-radius:10px;border:1px solid var(--line2);background:var(--s1);color:var(--ink);text-decoration:none;cursor:pointer;transition:border-color .16s var(--ease),background .16s var(--ease)}
.app .disccard:hover{border-color:rgba(var(--w),.22);background:var(--s2)}
.app .discban{position:relative;display:block;width:100%;aspect-ratio:16/6.4;overflow:hidden;border-bottom:1px solid var(--line);background:var(--s2)}
.app .discban img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .3s var(--ease)}
.app .disccard:hover .discban img{transform:scale(1.03)}
.app .discbody{position:relative;display:flex;flex-direction:column;gap:6px;padding:30px 16px 16px;min-width:0}
.app .discmark{position:absolute;top:-20px;left:16px;width:40px;height:40px;border-radius:10px;overflow:hidden;border:2px solid var(--bg);box-shadow:0 0 0 1px var(--line2);background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--ink)}
.app .discmark img{width:100%;height:100%;object-fit:cover}
.app .dischead{display:flex;align-items:center;gap:10px;min-width:0}
.app .dischead b{flex:1;min-width:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .dischead .tag{flex:none;transform:none;color:var(--ink2);white-space:nowrap}
.app .discline{font-size:13px;line-height:1.45;color:var(--ink2);min-height:38px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.app .discmeta{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--ink3);white-space:nowrap;min-width:0}
.app .discmeta .discface{width:18px;height:18px;flex:none;border-radius:999px;overflow:hidden;background:var(--s3);border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:var(--ink2)}
.app .discmeta .discface img{width:100%;height:100%;object-fit:cover}
.app .discmeta .dischost{color:var(--ink2);min-width:0;overflow:hidden;text-overflow:ellipsis}
.app .discmeta .disclife{margin-left:auto;flex:none;display:flex;align-items:center;gap:6px}
.app .discmeta .disclife i{width:6px;height:6px;border-radius:999px;background:#3DAE8C}
.app .discskel{border-radius:10px;border:1px solid var(--line);background:var(--s1)}
.app .discskel::before{content:"";display:block;aspect-ratio:16/6.4}
.app .discskel::after{content:"";display:block;height:130px}
.app .discin{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.app .discin .chip{gap:8px;height:32px;cursor:pointer;background:none}
.app .discin .chip span{width:18px;height:18px;flex:none;border-radius:5px;overflow:hidden;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--ink2)}
.app .discin .chip span img{width:100%;height:100%;object-fit:cover}
.app .discfoot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:36px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--ink2)}
.app .discfind{display:flex;margin:0;width:264px;height:32px}
@media (max-width:1100px){.app .discgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:700px){.app .discgrid{grid-template-columns:1fr;gap:14px}}
:where(:root[data-layout="phone"]) .app .discgrid{grid-template-columns:1fr;gap:14px}
:where(:root[data-layout="phone"]) .app .discfind{width:100%;margin-bottom:14px}
.app .startc{display:grid;grid-template-columns:minmax(0,1fr) 320px;color:var(--ink)}
.app .startc-form{display:flex;flex-direction:column;gap:18px;padding:28px 28px 24px;min-width:0}
.app .startc-form h2{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em}
.app .startc-form .startc-sub{margin:6px 0 0;font-size:13px;color:var(--ink2)}
.app .startc-field{display:block}
.app .startc-field>span:first-child{display:block;margin-bottom:6px;font-size:12px;font-weight:500;color:var(--ink3)}
.app .startc-field>span:first-child em{font-style:normal;color:var(--ink4)}
.app .startc-field input[type=text]{width:100%;height:38px;padding:0 12px;border-radius:9px;border:1px solid var(--line2);background:var(--s1);color:var(--ink);font:inherit;font-size:14px;outline:0;transition:border-color .16s var(--ease)}
.app .startc-field input[type=text]:focus{border-color:rgba(var(--w),.3)}
.app .startc-field input[aria-invalid=true]{border-color:var(--bad-line)}
.app .startc-addr{display:block;margin-top:6px;font-size:12px;color:var(--ink3);overflow-wrap:anywhere}
.app .startc-addr b{font-weight:500;color:var(--ink2)}
.app .startc-addr button{padding:0;font-size:12px;color:var(--ink3);text-decoration:underline;cursor:pointer}
.app .startc-files{display:flex;flex-wrap:wrap;gap:8px}
.app .startc-files label{cursor:pointer}
.app .startc-files label[aria-disabled=true]{opacity:.5;pointer-events:none}
.app .startc-files input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.app .startc-err{margin:0;font-size:13px;color:var(--bad)}
.app .startc-field textarea{display:block;width:100%;min-height:92px;padding:10px 12px;border-radius:9px;border:1px solid var(--line2);background:var(--s1);color:var(--ink);font:inherit;font-size:14px;line-height:1.45;outline:0;resize:vertical;transition:border-color .16s var(--ease)}
.app .startc-field textarea:focus{border-color:rgba(var(--w),.3)}
.app .startc-pick{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.app .startc-pick>button{height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--line2);font-size:13.5px;color:var(--ink2);cursor:pointer}
.app .startc-pick>button.on{border-color:rgba(var(--w),.34);background:var(--s2);color:var(--ink)}
.app .startc-price{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink2)}
.app .startc-field .startc-price input[type=text]{width:84px;height:34px}
.app .startc-check{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--ink1);cursor:pointer}
.app .startc-check input{width:15px;height:15px;accent-color:var(--ink)}
.app .startc-link{display:flex;align-items:center;gap:8px}
.app .startc-link input[type=text]{flex:1;min-width:0}
.app .startc-link .btn{height:38px;flex:none}
/* Every step is as tall as the tallest, so the window holds still between them. */
.app .startc-form{min-height:432px}
/* One bar under every step: back on the left, the dots in the middle, forward on the right. */
.app .startc-foot{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:auto;padding-top:18px;border-top:1px solid var(--line)}
.app .startc-foot-go{display:flex;justify-content:flex-end}
.app .startc-foot .btn{height:38px;padding:0 16px;gap:7px;border-radius:9px;font-size:14px;font-weight:500}
.app .startc-foot .btn.go{padding:0 18px;box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 6px 18px -8px rgba(0,0,0,.6)}
.app .startc-foot .btn .ic{width:15px;height:15px;transition:transform .16s var(--ease)}
.app .startc-foot .btn.go:not(:disabled):hover .ic{transform:translateX(2px)}
.app .startc-foot-back .btn:not(:disabled):hover .ic{transform:translateX(-2px)}
.app .startc-foot .btn:disabled{opacity:.45;cursor:not-allowed}
.app .startc-dots{display:flex;justify-content:center;gap:7px}
.app .startc-dots i{width:6px;height:6px;border-radius:999px;background:var(--line2);transition:background .2s var(--ease),width .2s var(--ease)}
.app .startc-dots i.on{width:18px;background:var(--ink)}
.app .startc-side{display:flex;flex-direction:column;gap:12px;padding:28px 24px 24px;border-left:1px solid var(--line);background:var(--s1);min-width:0}
.app .startc-side p{margin:0;font-size:12px;line-height:1.5;color:var(--ink3)}
.app .startc-side .disccard{cursor:default;pointer-events:none}
@media (max-width:760px){.app .startc{grid-template-columns:1fr}.app .startc-side{border-left:0;border-top:1px solid var(--line)}}
:where(:root[data-layout="phone"]) .app .startc{grid-template-columns:1fr}
:where(:root[data-layout="phone"]) .app .startc-side{border-left:0;border-top:1px solid var(--line)}
"""
header = "/* Generated by scripts/design/build_v1_kit_css.py from docs/design/hifi-mock/style.css.\n   Do not edit by hand: change the mock, then run the script. */\n"
if "--stdout" in sys.argv:
    sys.stdout.write(header + css)
else:
    (ROOT / "apps/web/src/v1/kit.module.css").write_text(header + css)
    print("kit.module.css", len(css.splitlines()), "lines")
