/**
 * Site "photos" as illustrations in the Neev palette: second-floor shuttering,
 * brickwork, a cement delivery and a rebar mesh. Used wherever the app shows a
 * site photo, so the films never pass off stock images as real captures.
 * All drawn in a 400×300 box and cropped to fit (object-fit: cover).
 */
import type {CSSProperties, ReactElement} from 'react';

import {FONT} from '../../brand/fonts';

export type SiteScene = 'shuttering' | 'brickwork' | 'cement' | 'rebar';

const grainId = (scene: string) => `grain-${scene}`;

function Grain({scene}: {scene: string}) {
  return (
    <filter id={grainId(scene)} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.10" />
      </feComponentTransfer>
      <feComposite in2="SourceGraphic" operator="in" />
    </filter>
  );
}

function Shuttering() {
  const props = Array.from({length: 13}, (_, i) => 30 + i * 28.5);
  return (
    <>
      <defs>
        <linearGradient id="sky-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4dfc0" />
          <stop offset="1" stopColor="#f7ecd9" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky-s)" />
      {/* first floor: slab on columns */}
      <rect x="0" y="262" width="400" height="38" fill="#a89a7f" />
      {[40, 150, 260, 370].map((x) => (
        <rect key={x} x={x - 9} y={196} width={18} height={66} fill="#b8b0a2" />
      ))}
      <rect x="0" y="182" width="400" height="16" fill="#9e968a" />
      <rect x="0" y="196" width="400" height="3" fill="rgba(42,37,25,0.18)" />
      {/* props and ledgers under the second-floor deck */}
      {props.map((x) => (
        <g key={x}>
          <rect x={x - 2.2} y={92} width={4.4} height={90} fill="#5b5446" />
          <rect x={x - 7} y={178} width={14} height={4} rx={1} fill="#3f3a30" />
        </g>
      ))}
      <path d="M30 170 L372 110 M30 112 L372 172" stroke="#6b6455" strokeWidth="2.4" opacity="0.65" />
      <rect x="18" y="84" width="364" height="9" fill="#8a5a2b" />
      {/* plywood deck with sheet seams */}
      <rect x="10" y="66" width="380" height="18" fill="#c9955c" />
      {Array.from({length: 8}, (_, i) => (
        <rect key={i} x={10 + i * 47.5} y={66} width={1.6} height={18} fill="#8a5a2b" opacity={0.7} />
      ))}
      <rect x="10" y="66" width="380" height="3" fill="#dcae74" />
      {/* rebar starters above the deck */}
      {Array.from({length: 24}, (_, i) => (
        <rect key={i} x={20 + i * 15.6} y={i % 2 ? 50 : 44} width={2.4} height={i % 2 ? 16 : 22} fill="#7a4a2e" />
      ))}
      <rect x="14" y="58" width="372" height="2.4" fill="#7a4a2e" opacity="0.8" />
      {/* columns of the second floor in shuttering boxes */}
      {[40, 370].map((x) => (
        <rect key={x} x={x - 11} y={93} width={22} height={89} fill="#b9824a" />
      ))}
    </>
  );
}

function Brickwork() {
  const rows = 9;
  const h = 26;
  const w = 64;
  const tones = ['#b4583a', '#a24e33', '#bd6440', '#aa5536', '#c06b45'];
  const bricks: Array<{x: number; y: number; c: string}> = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? -w / 2 : 0;
    const y = 300 - (r + 1) * (h + 4);
    // The top course is half laid, stepping back.
    const count = r === rows - 1 ? 3 : r === rows - 2 ? 5 : 8;
    for (let i = 0; i < count; i++) {
      bricks.push({x: offset + i * (w + 4), y, c: tones[(r * 3 + i * 7) % tones.length]});
    }
  }
  return (
    <>
      <rect width="400" height="300" fill="#efe3cf" />
      <rect x="0" y="0" width="400" height="300" fill="#e2d6c2" />
      {bricks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={w} height={h} rx={2} fill={b.c} />
          <rect x={b.x} y={b.y} width={w} height={3} rx={1} fill="rgba(255,255,255,0.12)" />
        </g>
      ))}
      {/* string line and spirit level on the top course */}
      <line x1="0" y1="18" x2="400" y2="31" stroke="#f3efe6" strokeWidth="1.4" />
      <g transform="translate(150 22) rotate(1.8)">
        <rect x="0" y="0" width="220" height="16" rx="3" fill="#3e7a66" />
        <rect x="96" y="4" width="28" height="8" rx="4" fill="#dcebe3" />
        <circle cx="111" cy="8" r="2.6" fill="#f0a21f" />
      </g>
    </>
  );
}

function Cement() {
  const bag = (x: number, y: number, key: number) => (
    <g key={key} transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="92" height="40" rx="10" fill="#ece5d7" />
      <rect x="0" y="0" width="92" height="40" rx="10" fill="none" stroke="#c9bfa9" strokeWidth="1.5" />
      <rect x="0" y="15" width="92" height="9" fill="#3e7a66" />
      <text x="46" y="22" textAnchor="middle" fontFamily={FONT.text} fontWeight={700} fontSize="7.5" fill="#f3efe6" letterSpacing="0.8">
        CEMENT · 50 KG
      </text>
    </g>
  );
  const rows = [
    {y: 222, xs: [18, 112, 206, 300]},
    {y: 182, xs: [65, 159, 253]},
    {y: 142, xs: [112, 206]},
    {y: 102, xs: [159]},
  ];
  return (
    <>
      <rect width="400" height="300" fill="#d9cdb6" />
      <rect x="0" y="0" width="400" height="200" fill="#cbbd9f" />
      {Array.from({length: 9}, (_, i) => (
        <rect key={i} x={i * 46} y="0" width="2" height="200" fill="rgba(42,37,25,0.10)" />
      ))}
      <rect x="10" y="262" width="380" height="16" fill="#8a5a2b" />
      <rect x="10" y="278" width="380" height="22" fill="#6e4722" />
      {rows.flatMap((r, ri) => r.xs.map((x, i) => bag(x, r.y, ri * 10 + i)))}
    </>
  );
}

function Rebar() {
  const lines = Array.from({length: 13}, (_, i) => i * 33 - 2);
  return (
    <>
      <rect width="400" height="300" fill="#c9955c" />
      {Array.from({length: 4}, (_, i) => (
        <rect key={i} x={i * 100} y="0" width="1.6" height="300" fill="#8a5a2b" opacity="0.6" />
      ))}
      {/* bottom layer (shadow) then top layer */}
      {lines.map((x) => (
        <rect key={`v${x}`} x={x + 4} y={0} width={4} height={300} fill="rgba(42,37,25,0.25)" />
      ))}
      {lines.map((x) => (
        <rect key={`vb${x}`} x={x} y={0} width={4} height={300} fill="#7a4a2e" />
      ))}
      {lines.slice(0, 10).map((y) => (
        <rect key={`h${y}`} x={0} y={y + 8} width={400} height={4} fill="#8c5636" />
      ))}
      {lines.flatMap((x) =>
        lines.slice(0, 10).map((y) => <circle key={`${x}-${y}`} cx={x + 2} cy={y + 10} r={2.4} fill="#4a4438" />),
      )}
      {[
        [60, 120],
        [190, 60],
        [300, 200],
      ].map(([x, y]) => (
        <rect key={`${x}`} x={x} y={y} width={14} height={14} rx={2} fill="#b8b0a2" />
      ))}
    </>
  );
}

const SCENES: Record<SiteScene, () => ReactElement> = {
  shuttering: Shuttering,
  brickwork: Brickwork,
  cement: Cement,
  rebar: Rebar,
};

export function SiteIllustration({scene, style}: {scene: SiteScene; style?: CSSProperties}) {
  const Scene = SCENES[scene];
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{display: 'block', width: '100%', height: '100%', ...style}}>
      <defs>
        <Grain scene={scene} />
      </defs>
      <g>
        <Scene />
      </g>
      <rect width="400" height="300" filter={`url(#${grainId(scene)})`} fill="#000" />
    </svg>
  );
}
