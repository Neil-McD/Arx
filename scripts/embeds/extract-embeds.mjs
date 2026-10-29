// Turn the interactive parts of a self-contained course page into standalone
// Polynet embeds: one HTML file per widget, showing only that widget, with
// storage made safe for a sandboxed frame and colours/fonts taken from the
// community theme (--pn-*) when the embed helper provides them.
//
//   node extract-embeds.mjs <config.json> [page.html] [outDir]
//
// config: { page, outDir, inlineCss: [files], dropScripts: [src prefixes],
//           themeMap: { "--clo-var": "--pn-var" }, bootCall: "goToLesson",
//           storageKeys: [...], widgets: [{ id, title, lesson, keep: [[from, to?], ...], also: [selectors] }] }
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const cfg = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (process.argv[3]) cfg.page = process.argv[3];
if (process.argv[4]) cfg.outDir = process.argv[4];
const pageDir = dirname(cfg.page);
let html = readFileSync(cfg.page, "utf8");

// Inline local stylesheets so the file stands alone.
html = html.replace(/<link rel="stylesheet" href="([^"?]+)(\?[^"]*)?">/g, (m, href) =>
  cfg.inlineCss.includes(href) ? `<style>\n${readFileSync(resolve(pageDir, href), "utf8")}\n</style>` : "");
// Drop the portal's shell scripts; the embed is not a portal page.
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>\n?/g, (m, src) =>
  cfg.dropScripts.some((p) => src.startsWith(p)) ? "" : m);
html = html.replace(/<script>window\.CLO_COURSE_LESSONS[\s\S]*?<\/script>\n?/, "");
// Large inline images belong to lessons the widgets never show.
html = html.replace(/data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{4000,}/g, "data:,");
html = html.replace("<body hidden", "<body");
// Storage: a sandboxed frame has no localStorage; the embed helper saves for us.
html = html.replace(/localStorage\.getItem\(/g, "__kv.get(").replace(/localStorage\.setItem\(/g, "__kv.set(");
// The page boots by calling init(); the embed boots it after choosing its lesson.
html = html.replace(/\n\/\/ Boot after DOM\ninit\(\);/, "\n");

const themeCss = `:root{${Object.entries(cfg.themeMap).map(([v, pn]) => `${v}:var(${pn[0]},${pn[1]})`).join(";")}}`;
const head = `<script>
window.__kv={get:function(k){try{return localStorage.getItem(k)}catch(e){return window.__kvMem&&window.__kvMem[k]||null}},
set:function(k,v){try{localStorage.setItem(k,v)}catch(e){(window.__kvMem=window.__kvMem||{})[k]=v}
try{window.polynetEmbed&&window.polynetEmbed.save(k,v)}catch(e){}}};
</script>
<script src="/__polynet/embed.js" onerror="var s=document.createElement('script');s.src='embed.js';document.head.appendChild(s)"></script>`;
const embedCss = `<style>
${themeCss}
html,body{background:var(--bg);margin:0;height:auto;overflow:visible}
.app{display:block;overflow:visible;height:auto}
.main,#main{padding:16px;max-width:none;margin:0;overflow:visible;height:auto}
[data-embed-hidden]{display:none!important}
/* A side drawer has no viewport to slide in from inside an auto-height frame:
   open it in place, next to what was clicked. */
.drawer{position:absolute;right:0;height:auto;max-width:100%;display:none;box-shadow:0 8px 30px rgba(0,0,0,.18)}
.drawer.open{display:block}
.drawer-overlay{position:absolute}
</style>`;

mkdirSync(cfg.outDir, { recursive: true });
const manifest = [];
for (const w of cfg.widgets) {
  const boot = `<script>
(function(){
  var KEEP=${JSON.stringify(w.keep)}, ALSO=${JSON.stringify(w.also || [])}, KEYS=${JSON.stringify(cfg.storageKeys)};
  function isolate(){
    var root=document.querySelector('.lesson.active')||document.body, keep=new Set();
    KEEP.forEach(function(r){
      var a=root.querySelector(r[0]); if(!a) return;
      var b=r[1]?root.querySelector(r[1]):a; var el=a;
      while(el){keep.add(el); if(el===b) break; el=el.nextElementSibling;}
    });
    ALSO.forEach(function(s){document.querySelectorAll(s).forEach(function(e){keep.add(e)})});
    var path=new Set(); keep.forEach(function(el){for(var p=el;p;p=p.parentElement) path.add(p)});
    document.querySelectorAll('[data-embed-hidden]').forEach(function(e){e.removeAttribute('data-embed-hidden')});
    path.forEach(function(p){ [].forEach.call(p.children,function(c){ if(!path.has(c)&&!keep.has(c)&&!c.closest('[data-embed-keep]')) { var inside=false; keep.forEach(function(k){if(k.contains(c))inside=true}); if(!inside) c.setAttribute('data-embed-hidden','') } }) });
  }
  function show(){ state.currentLesson=${JSON.stringify(w.lesson)}; ${cfg.bootCall}(${JSON.stringify(w.lesson)}); setTimeout(isolate,0); setTimeout(isolate,120); }
  init(); show();
  if(typeof window.openDrawer==='function'){var od=window.openDrawer;window.openDrawer=function(){var r=od.apply(this,arguments);
    var t=(window.event&&window.event.target&&window.event.target.closest&&window.event.target.closest('[onclick]'))||null;
    var d=document.getElementById('drawer'); if(d){d.style.top=((t?t.getBoundingClientRect().top:0)+window.scrollY)+'px';} return r;};}
  // Saved state lives with the member on Polynet; load it once the helper is up.
  var tries=0;(function wait(){
    if(window.polynetEmbed&&window.polynetEmbed.load){
      Promise.all(KEYS.map(function(k){return window.polynetEmbed.load(k).catch(function(){return null})})).then(function(vals){
        var changed=false; KEYS.forEach(function(k,i){var v=vals[i]; if(v==null) return; if(typeof v!=='string') v=JSON.stringify(v);
          if(k==='bxr-scores'){state.scores=JSON.parse(v);changed=true} if(k==='bxr-completed'){state.completed=new Set(JSON.parse(v))}});
        if(changed) show();
      });
    } else if(++tries<30) setTimeout(wait,100);
  })();
  window.addEventListener('click',function(){setTimeout(isolate,0)},true);
})();
</script>`;
  let out = html.replace("</head>", `${head}\n${embedCss}\n<title>${w.title}</title>\n</head>`);
  out = out.replace(/<title>[^<]*<\/title>\n(?=[\s\S]*<title>)/, "");
  out = out.replace(/<\/body>(?![\s\S]*<\/body>)/, `${boot}\n</body>`);
  writeFileSync(resolve(cfg.outDir, `${w.id}.html`), out);
  manifest.push({ id: w.id, title: w.title, lesson: w.lesson, height: w.height ?? 520, fallback: `media/xray/${w.id}.png` });
}
writeFileSync(resolve(cfg.outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(manifest.map((m) => m.id).join(" "));
