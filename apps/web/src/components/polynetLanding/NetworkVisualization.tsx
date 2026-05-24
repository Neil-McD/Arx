/* Network visualization: animated morph between Hierarchy and Intelligence Network */
// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Two layouts share the same node identities so we can tween between them.
 * Coords are in normalized 0..1 space; rendered into a 16:9 viewbox.
 */
const NODES = [
  // CEO/center
  { id: 'ceo',  kind: 'human', label: 'CEO' },
  // Executives
  { id: 'ex1',  kind: 'human', label: 'EXEC' },
  { id: 'ex2',  kind: 'human', label: 'EXEC' },
  { id: 'ex3',  kind: 'human', label: 'EXEC' },
  // Managers
  { id: 'mg1',  kind: 'human', label: 'MGR' },
  { id: 'mg2',  kind: 'human', label: 'MGR' },
  { id: 'mg3',  kind: 'human', label: 'MGR' },
  { id: 'mg4',  kind: 'human', label: 'MGR' },
  // Teams (humans + agents in new model)
  { id: 't1',   kind: 'agent', label: 'AGENT' },
  { id: 't2',   kind: 'human', label: 'IC' },
  { id: 't3',   kind: 'agent', label: 'AGENT' },
  { id: 't4',   kind: 'human', label: 'IC' },
  { id: 't5',   kind: 'agent', label: 'AGENT' },
  { id: 't6',   kind: 'human', label: 'IC' },
];

const HIERARCHY = {
  ceo: { x: 0.5,  y: 0.10 },
  ex1: { x: 0.28, y: 0.30 },
  ex2: { x: 0.50, y: 0.30 },
  ex3: { x: 0.72, y: 0.30 },
  mg1: { x: 0.16, y: 0.52 },
  mg2: { x: 0.39, y: 0.52 },
  mg3: { x: 0.61, y: 0.52 },
  mg4: { x: 0.84, y: 0.52 },
  t1:  { x: 0.10, y: 0.78 },
  t2:  { x: 0.24, y: 0.78 },
  t3:  { x: 0.38, y: 0.78 },
  t4:  { x: 0.55, y: 0.78 },
  t5:  { x: 0.72, y: 0.78 },
  t6:  { x: 0.88, y: 0.78 },
};

const HIERARCHY_EDGES = [
  ['ceo','ex1'], ['ceo','ex2'], ['ceo','ex3'],
  ['ex1','mg1'], ['ex1','mg2'],
  ['ex2','mg2'], ['ex2','mg3'],
  ['ex3','mg3'], ['ex3','mg4'],
  ['mg1','t1'], ['mg1','t2'],
  ['mg2','t2'], ['mg2','t3'],
  ['mg3','t4'], ['mg3','t5'],
  ['mg4','t5'], ['mg4','t6'],
];

// Network model: ring around shared memory center
function ringLayout() {
  const N = NODES.length;
  const r = 0.34;
  const cx = 0.5, cy = 0.5;
  const out = {};
  NODES.forEach((n, i) => {
    // Skip the center "ceo" position — turn it into the SHARED MEMORY core
    const idx = i;
    const angle = (idx / N) * Math.PI * 2 - Math.PI / 2;
    out[n.id] = {
      x: cx + Math.cos(angle) * r * (n.id === 'ceo' ? 0 : 1),
      y: cy + Math.sin(angle) * r * (n.id === 'ceo' ? 0 : 1) * (16/9 * 0.56), // squash for aspect
    };
  });
  out.ceo = { x: 0.5, y: 0.5 };
  return out;
}
const NETWORK = ringLayout();

const NETWORK_EDGES = (() => {
  const arr = [];
  const ids = NODES.filter(n => n.id !== 'ceo').map(n => n.id);
  // Every peripheral node connects to the center (memory)
  ids.forEach(id => arr.push(['ceo', id]));
  // Plus a sparse mesh between peers
  for (let i = 0; i < ids.length; i++) {
    arr.push([ids[i], ids[(i+1) % ids.length]]);
    arr.push([ids[i], ids[(i+3) % ids.length]]);
  }
  return arr;
})();

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }

function NodeGlyph({ kind, isCenter, r }) {
  if (isCenter) {
    return (
      <g>
        <circle r={r * 1.6} fill="#22141a" stroke="#d63a47" strokeWidth="1.2" />
        <circle r={r * 1.6} fill="url(#coreGlow)" opacity="0.9" />
        {/* tiny inner network */}
        <g stroke="#d63a47" strokeWidth="1" fill="#d63a47">
          <circle cx="0" cy="0" r={r*0.45} />
          <circle cx={-r*0.9} cy={-r*0.4} r={r*0.18} />
          <circle cx={r*0.9} cy={-r*0.4} r={r*0.18} />
          <circle cx={-r*0.6} cy={r*0.7} r={r*0.18} />
          <circle cx={r*0.6} cy={r*0.7} r={r*0.18} />
          <line x1={0} y1={0} x2={-r*0.9} y2={-r*0.4} />
          <line x1={0} y1={0} x2={r*0.9} y2={-r*0.4} />
          <line x1={0} y1={0} x2={-r*0.6} y2={r*0.7} />
          <line x1={0} y1={0} x2={r*0.6} y2={r*0.7} />
        </g>
      </g>
    );
  }
  // Person or agent
  if (kind === 'agent') {
    return (
      <g>
        <circle r={r} fill="#17171a" stroke="#d63a47" strokeWidth="1.2" />
        {/* robot head bracket */}
        <rect x={-r*0.4} y={-r*0.35} width={r*0.8} height={r*0.55} rx={r*0.12} fill="none" stroke="#d63a47" strokeWidth="1" />
        <circle cx={-r*0.15} cy={-r*0.1} r={r*0.07} fill="#d63a47" />
        <circle cx={r*0.15} cy={-r*0.1} r={r*0.07} fill="#d63a47" />
        <line x1={0} y1={-r*0.35} x2={0} y2={-r*0.55} stroke="#d63a47" strokeWidth="1" />
      </g>
    );
  }
  // Person
  return (
    <g>
      <circle r={r} fill="#17171a" stroke="#d63a47" strokeWidth="1.2" />
      <circle cx="0" cy={-r*0.2} r={r*0.22} fill="#d63a47" />
      <path d={`M ${-r*0.35} ${r*0.35} Q 0 ${r*0.0} ${r*0.35} ${r*0.35}`} stroke="#d63a47" strokeWidth="1.2" fill="none" />
    </g>
  );
}

function NetworkVisualization() {
  // mode flips once: 'hierarchy' → 'network'. The flip is triggered when the
  // user scrolls the viz into view (single trigger point — not a continuous
  // scroll-tied morph). Toggle buttons let the user flip back manually.
  const [mode, setMode] = useState('hierarchy');
  const [t, setT] = useState(0); // tween 0..1 (0=hierarchy, 1=network)
  const targetRef = useRef(0);
  const rafRef = useRef(null);
  const triggeredRef = useRef(false);

  // Tween toward target whenever mode changes
  useEffect(() => {
    targetRef.current = mode === 'hierarchy' ? 0 : 1;
    const tick = () => {
      setT(prev => {
        const diff = targetRef.current - prev;
        if (Math.abs(diff) < 0.001) {
          rafRef.current = null;
          return targetRef.current;
        }
        rafRef.current = requestAnimationFrame(tick);
        return prev + diff * 0.06;
      });
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [mode]);

  // Auto-trigger the flip the first time the user scrolls the viz into view.
  // After that, the toggle buttons take over.
  const stageRef = useRef(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !triggeredRef.current) {
          triggeredRef.current = true;
          // Small delay so the user registers the hierarchy state first.
          setTimeout(() => setMode('network'), 600);
          obs.disconnect();
        }
      });
    }, { threshold: 0.45 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const eT = ease(t);
  const W = 1600, H = 900;
  const positions = useMemo(() => {
    const out = {};
    NODES.forEach(n => {
      const a = HIERARCHY[n.id];
      const b = NETWORK[n.id];
      out[n.id] = {
        x: lerp(a.x, b.x, eT) * W,
        y: lerp(a.y, b.y, eT) * H,
      };
    });
    return out;
  }, [eT]);

  const edges = useMemo(() => {
    return { hier: HIERARCHY_EDGES, net: NETWORK_EDGES };
  }, []);

  return (
    <div className="net-stage" ref={stageRef}>
      <div className="switcher">
        <button className={mode === 'hierarchy' ? 'active' : ''} onClick={() => setMode('hierarchy')}>01 · Hierarchy</button>
        <button className={mode === 'network' ? 'active' : ''} onClick={() => setMode('network')}>02 · Intelligence Network</button>
      </div>
      <div className="caption">
        {mode === 'hierarchy'
          ? <><div>OLD MODEL</div><div style={{color:'var(--ink-3)'}}>top-down, lossy, slow</div></>
          : <><div>NEW MODEL</div><div style={{color:'var(--pink-1)'}}>peer-to-peer, memoryful, fast</div></>
        }
      </div>
      <div className="legend">
        <div className="item"><span className="swatch" style={{background:'#17171a', borderColor:'#d63a47'}}></span> Person</div>
        <div className="item"><span className="swatch" style={{background:'#17171a', borderColor:'#d63a47', borderStyle:'dashed'}}></span> Agent</div>
        <div className="item"><span className="swatch" style={{background:'#d63a47', borderColor:'#d63a47'}}></span> Shared Memory</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <radialGradient id="coreGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#d63a47" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#d63a47" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#d63a47" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bgGlow" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0%" stopColor="#d63a47" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#d63a47" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill="url(#bgGlow)" opacity={eT} />

        <g opacity={1}>
          {edges.hier.map(([a,b], i) => {
            const pa = positions[a], pb = positions[b];
            return (
              <line
                key={'h'+i}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke="#d63a47"
                strokeOpacity={(1 - eT) * 0.7}
                strokeWidth="1.2"
              />
            );
          })}
          {edges.net.map(([a,b], i) => {
            const pa = positions[a], pb = positions[b];
            const isCenter = a === 'ceo' || b === 'ceo';
            return (
              <line
                key={'n'+i}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke="#d63a47"
                strokeOpacity={eT * (isCenter ? 0.55 : 0.3)}
                strokeWidth={isCenter ? 1.2 : 0.8}
                strokeDasharray={isCenter ? '0' : '3 4'}
              />
            );
          })}
        </g>

        <g>
          {NODES.map((n) => {
            const p = positions[n.id];
            const isCenter = n.id === 'ceo' && eT > 0.4;
            const r = isCenter ? 36 : 22;
            return (
              <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
                <NodeGlyph kind={n.kind} isCenter={isCenter} r={r} />
                <text
                  y={isCenter ? r * 1.6 + 18 : r + 18}
                  textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="13"
                  fill={isCenter ? '#e85563' : '#8a7d84'}
                  letterSpacing="2"
                >
                  {isCenter ? 'SHARED MEMORY' : n.label}
                </text>
              </g>
            );
          })}
        </g>

        {eT > 0.5 && <PacketLayer positions={positions} edges={edges.net} opacity={eT} />}
      </svg>
    </div>
  );
}

function PacketLayer({ positions, edges, opacity }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      setPhase(((now - start) / 1800) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Show packets on a subset of edges
  const subset = edges.filter((_, i) => i % 3 === 0);
  return (
    <g opacity={opacity}>
      {subset.map(([a,b], i) => {
        const pa = positions[a], pb = positions[b];
        const local = (phase + i * 0.13) % 1;
        const x = lerp(pa.x, pb.x, local);
        const y = lerp(pa.y, pb.y, local);
        return <circle key={i} cx={x} cy={y} r="3" fill="#e85563" opacity="0.9" />;
      })}
    </g>
  );
}

export { NetworkVisualization };
