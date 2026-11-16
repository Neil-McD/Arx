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
.app .brainmini{display:block;width:100%;padding:6px 0;margin:0 0 4px;border-radius:10px;text-align:center}
.app button.brainmini{cursor:pointer;transition:background .12s}
.app button.brainmini:hover{background:rgba(var(--w),.035)}
.app .brainmini svg.brain-panel{max-height:210px;margin:0 auto}
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
.app .evaddrow{display:flex;align-items:center;gap:12px;width:100%;height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--line2);background:var(--panel2);color:var(--ink2);font-size:14px;text-align:left}
.app .evaddrow:hover{color:var(--ink);border-color:rgba(var(--w),.18)}
.app .evaddrow .ic{width:16px;height:16px;color:var(--ink3)}
.app .evaddrow span{margin-left:auto;font-size:12.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app .evadd{margin-top:0;padding:14px 12px 12px 16px;border-color:rgba(var(--au),.45);box-shadow:0 0 0 4px rgba(var(--au),.08)}
.app .evline{display:block;width:100%;height:30px;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:17px;font-weight:500}
.app .evline::placeholder{color:var(--ink3);font-weight:400}
.app .evhead{font-size:15px;font-weight:550}
.app .evnote{margin-top:10px;font-size:12px;color:var(--ink3)}
.app .evread{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.app .evread button{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 10px;border-radius:7px;border:1px solid var(--line);background:var(--s1);color:var(--ink);font-size:13px}
.app .evread button:hover{border-color:var(--line2)}
.app .evread .ic{width:14px;height:14px;color:var(--ink3)}
.app .evparts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;margin-top:12px;padding-right:4px}
.app .evparts label{display:flex;flex-direction:column;gap:4px;min-width:0}
.app .evparts label.wide{grid-column:1/-1}
.app .evparts label>span{font-size:12px;color:var(--ink3)}
.app .evparts input:not([type=checkbox]),.app .evparts select,.app .evparts textarea{width:100%;box-sizing:border-box;min-height:34px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:13.5px;line-height:1.5;outline:0;resize:vertical}
.app .evparts input:focus,.app .evparts select:focus,.app .evparts textarea:focus{border-color:var(--line2)}
.app .evparts input::placeholder{color:var(--ink3)}
.app .evparts label.evpublic{flex-direction:row;align-items:flex-start;gap:10px}
.app .evparts label.evpublic input{margin-top:3px}
.app .evparts label.evpublic>span{font-size:13.5px;color:var(--ink)}
.app .evparts label.evpublic small,.app .evswitch small{display:block;margin-top:2px;font-size:12px;color:var(--ink3)}
.app .everr{margin-top:10px;font-size:13px;color:var(--bad)}
.app .evfoot{display:flex;align-items:center;gap:8px;margin-top:14px}
.app .evfoot>span{flex:1;min-width:0;font-size:12.5px;color:var(--ink3)}
.app .evdim{opacity:.5}
.app .evname{display:inline;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.app .evname:hover{text-decoration:underline;text-decoration-color:var(--line2)}
.app .evask{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);white-space:nowrap}
.app .evswitch{display:flex;align-items:flex-start;gap:12px;font-size:13.5px}
.app .evswitch>span{flex:1;min-width:0}
.app .evsw{flex:none;position:relative;width:34px;height:20px;margin-top:1px;border-radius:10px;border:0;background:var(--s2);transition:background .16s var(--ease)}
.app .evsw i{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:var(--ink2);transition:left .16s var(--ease),background .16s var(--ease)}
.app .evsw.on{background:var(--go)}.app .evsw.on i{left:17px;background:#fff}
:where(:root[data-layout="phone"]) .app .evparts{grid-template-columns:minmax(0,1fr)}:where(:root[data-layout="phone"]) .app .evaddrow span{display:none}:where(:root[data-layout="phone"]) .app .erow{row-gap:8px}

/* Kit addition: Knowledge's one box at the top (KitKnowledgeAdd): the row it
   is while closed, how it says back what it read, and the Note / Course
   switch in its foot. */
.app .kaddrow{display:flex;align-items:center;gap:12px;width:100%;height:46px;margin-top:20px;padding:0 14px;border-radius:10px;border:1px solid var(--line2);background:var(--panel2);color:var(--ink2);font-size:14px;text-align:left}
.app .kaddrow:hover{color:var(--ink);border-color:rgba(var(--w),.18)}
.app .kaddrow .ic{width:16px;height:16px;color:var(--ink3)}
.app .kaddrow .ic.sp{color:var(--aurora-ink)}
.app .krot{position:relative;flex:1;min-width:0;height:20px;overflow:hidden}
.app .krot b{position:absolute;inset:0;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:krot 9s var(--ease) infinite both}
.app .krot b+b{animation-delay:-4.5s}
@keyframes krot{0%,42%{opacity:1;transform:none}50%,92%{opacity:0;transform:translateY(-6px)}93%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.app .krot b{animation:none}.app .krot b+b{display:none}}
.app .kaddbox{margin-top:20px;padding:14px 12px 12px 16px;border-color:rgba(var(--au),.45);box-shadow:0 0 0 4px rgba(var(--au),.08)}
.app .kaddbox textarea{font-size:15px;line-height:1.6;min-height:48px;max-height:260px;overflow-y:auto}
.app .kreadlab{margin-top:10px;font-size:12px;color:var(--ink3)}
.app .kread{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.app .kread span{display:inline-flex;align-items:center;gap:7px;min-height:28px;max-width:100%;padding:3px 10px;border-radius:7px;border:1px solid var(--line);background:var(--s1);color:var(--ink);font-size:13px}
.app .kread span svg{width:14px;height:14px;flex:none;color:var(--ink3)}
.app .kread span em{font-style:normal;color:var(--ink3)}
.app .kread span.dim{color:var(--ink3)}
.app .kaddfoot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin-top:14px}
.app .kseg{display:inline-flex;padding:2px;border-radius:8px;border:1px solid var(--line2);background:var(--field)}
.app .kseg button{height:24px;padding:0 10px;border-radius:6px;font-size:12.5px;font-weight:500;color:var(--ink2)}
.app .kseg button[aria-pressed="true"]{background:var(--s2);color:var(--ink)}

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
:where(:root[data-layout="phone"]) .app .filters{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
:where(:root[data-layout="phone"]) .app .filters::-webkit-scrollbar{display:none}
:where(:root[data-layout="phone"]) .app .filters>*{flex:none}
:where(:root[data-layout="phone"]) .app .mrow .h{flex-wrap:wrap;row-gap:0}
:where(:root[data-layout="phone"]) .app .mrow .h b{flex:none;white-space:nowrap}
:where(:root[data-layout="phone"]) .app .trow{grid-template-columns:28px minmax(0,1fr) auto auto;gap:0 12px}
:where(:root[data-layout="phone"]) .app .trow>:nth-child(3){display:none}
"""
header = "/* Generated by scripts/design/build_v1_kit_css.py from docs/design/hifi-mock/style.css.\n   Do not edit by hand: change the mock, then run the script. */\n"
if "--stdout" in sys.argv:
    sys.stdout.write(header + css)
else:
    (ROOT / "apps/web/src/v1/kit.module.css").write_text(header + css)
    print("kit.module.css", len(css.splitlines()), "lines")
