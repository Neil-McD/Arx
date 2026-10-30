// The widget helper, served at /__polynet/embed.js on every community site.
// A lesson shows a widget from the site (a polynet-embed block) in a sandboxed
// frame with no access to the member's session. This helper is the widget's
// only line to the lesson around it: the community's theme, the frame's height,
// and the member's saved answers. The message shapes are defined in
// shared/communityEmbed.ts. Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.
export const EMBED_SOURCE = String.raw`// Polynet widget helper. Usage, in a widget page on your community site:
//   <script src="/__polynet/embed.js"></script>
//   const saved = await polynetEmbed.load("scores");   // a string, or null
//   await polynetEmbed.save("scores", JSON.stringify(scores));
// Style with the community's theme: var(--pn-accent), var(--pn-text), var(--pn-font-body) ...
// Opened directly (not inside a lesson), load returns null and save keeps nothing.
(function () {
  if (window.polynetEmbed) return;
  var inFrame = window.parent && window.parent !== window;
  var nextId = 1;
  var pending = {};
  var memory = {};
  var TIMEOUT_MS = 3000;

  function post(message) {
    message.polynetEmbed = 1;
    if (inFrame) window.parent.postMessage(message, "*");
  }

  function request(message, fallback) {
    if (!inFrame) return Promise.resolve(fallback);
    return new Promise(function (resolve) {
      var id = nextId++;
      var timer = setTimeout(function () { delete pending[id]; resolve(fallback); }, TIMEOUT_MS);
      pending[id] = function (value) { clearTimeout(timer); delete pending[id]; resolve(value); };
      message.id = id;
      post(message);
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.polynetEmbed !== 1) return;
    if (data.type === "theme" && data.variables) {
      for (var name in data.variables) {
        if (name.indexOf("--pn-") === 0) document.documentElement.style.setProperty(name, String(data.variables[name]));
      }
      return;
    }
    if ((data.type === "loaded" || data.type === "saved") && pending[data.id]) {
      pending[data.id](data.type === "loaded" ? (typeof data.value === "string" ? data.value : null) : data.ok === true);
    }
  });

  var lastHeight = 0;
  function reportHeight() {
    var height = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    if (height && Math.abs(height - lastHeight) > 1) {
      lastHeight = height;
      post({ type: "resize", height: height });
    }
  }

  function start() {
    post({ type: "ready" });
    reportHeight();
    if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.documentElement);
    window.addEventListener("load", reportHeight);
  }

  window.polynetEmbed = {
    load: function (key) {
      return request({ type: "load", key: String(key) }, null).then(function (value) {
        if (value === null && Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
        return value;
      });
    },
    save: function (key, value) {
      memory[key] = String(value);
      return request({ type: "save", key: String(key), value: String(value) }, false);
    },
    resize: reportHeight,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
`;
