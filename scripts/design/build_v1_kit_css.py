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

/* Home's right column: Today's lines (each opens what it names), who is
   online, and the memory map as a button. */
.app .today{list-style:none;margin:2px 0 10px;padding:0;display:flex;flex-direction:column;gap:12px}
.app .today-line{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left}
.app .today-line b{font-weight:500;font-size:14px;line-height:1.4;color:var(--ink)}
.app .today-line em{font-style:normal;font-size:12px;color:var(--ink3)}
.app button.today-line{cursor:pointer}.app button.today-line:hover b{text-decoration:underline;text-decoration-color:var(--line2);text-underline-offset:3px}
.app .here-row{display:flex;align-items:center;gap:12px}
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
.app .podout .btn{margin-top:auto}
/* The pod picked: its pitch is in the right column. */
.app .podsel{border-color:var(--accent,var(--line2));box-shadow:inset 0 0 0 1px var(--accent,var(--line2))}
.app .podpage .acts{display:flex;flex-wrap:wrap;gap:8px}
.app .podform-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.app .podform-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2);cursor:pointer}
.app .podform-check input{width:auto}
.app .podform-seats{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2)}
.app .podform-seats input{width:96px}
.app .podprice{font-size:13px;color:var(--ink);font-weight:500}
.app .podpage{display:flex;flex-direction:column;gap:14px;max-width:620px;margin-top:20px}
.app .podpage .podname{font-size:20px}
.app .podget{margin:4px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--ink)}
.app .podlink{background:none;border:0;padding:0;cursor:pointer;text-align:left;color:inherit;font:inherit}
.app .podlink:hover{text-decoration:underline}
.app .podtag{margin-left:8px;font-size:11px;color:var(--ink3);border:1px solid var(--line2);border-radius:999px;padding:1px 7px;white-space:nowrap}
.app .podleave{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.app .podnote{padding:6px 0;border-bottom:1px solid var(--line)}
.app .podnote:last-of-type{border-bottom:0}
.app .podnote-title{background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:500;color:var(--ink);cursor:pointer;text-align:left;width:100%}
.app .podnote-title:hover{text-decoration:underline}
.app .podnote-body{margin:8px 0 6px;font-size:13px;line-height:1.55;color:var(--ink2)}
.app .podnote-body p{margin:0 0 8px}
.app .podform select{padding:7px 10px;border-radius:8px;border:1px solid var(--line2);background:var(--field);color:var(--ink);font:inherit;font-size:13px}
.app .podreq{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;font-size:13px;color:var(--ink)}
.app .podreq em{font-style:normal;color:var(--ink3)}
.app .podreq-acts{display:flex;gap:4px}

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
/* Home's header bar names the page over the centred column. */
.app.part.on-v-home .top{padding-left:var(--measure-gutter);padding-right:var(--measure-gutter)}
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
