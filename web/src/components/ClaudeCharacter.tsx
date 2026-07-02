import type {
  ClawdAccessory,
  ClawdEyes,
  ClawdMouth,
  ClawdOverhead,
  Mood,
} from '../lib/usage';
import { moodColor } from '../lib/usage';

interface Props {
  mood?: Mood;
  eyes?: ClawdEyes;
  mouth?: ClawdMouth;
  accessory?: ClawdAccessory;
  overhead?: ClawdOverhead;
  pulseKey?: number;
  size?: number;
  /** Couleur du corps (défaut : selon l'humeur). Ignorée en mono. */
  color?: string;
  /** Vue e-paper : ni halo ni animation. */
  flat?: boolean;
  /** Contour blanc façon sticker (mode couleur). */
  outline?: boolean;
  /** Version noir & blanc : line-art encre sur corps blanc. */
  mono?: boolean;
  frame?: 'tight' | 'wide';
}

const INK = '#141414';
const BASE = '#cf7052';
const WHITE = '#ffffff';
const PURPLE = '#a273f0';
const SPARKLE = '#9b7cf0';
const STEEL = '#8a857c';

const BODY = { x: 60, y: 40, w: 120, h: 88 };
const LARM = { x: 42, y: 80, w: 18, h: 26 };
const RARM = { x: 180, y: 80, w: 18, h: 26 };
const LEGS = [
  { x: 88, y: 128, w: 12, h: 22 },
  { x: 140, y: 128, w: 12, h: 22 },
];

interface Box { x: number; y: number; w: number; h: number }
const R = ({ x, y, w, h, fill }: Box & { fill: string }) => (
  <rect x={x} y={y} width={w} height={h} fill={fill} />
);

function eyesFromMood(mood: Mood): ClawdEyes {
  return mood === 'panic' ? 'wide' : 'square';
}
function mouthFromMood(mood: Mood): ClawdMouth {
  if (mood === 'panic') return 'open';
  if (mood === 'worried') return 'line';
  return 'none';
}

function spiralPath(cx: number, cy: number): string {
  let d = `M${cx} ${cy}`;
  const steps = 26;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ang = t * 2.2 * 2 * Math.PI;
    const r = t * 9;
    d += ` L${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`;
  }
  return d;
}

function Eyes({ eyes }: { eyes: ClawdEyes }) {
  switch (eyes) {
    case 'square':
      return (
        <>
          <R x={89} y={58} w={14} h={16} fill={INK} />
          <R x={137} y={58} w={14} h={16} fill={INK} />
        </>
      );
    case 'wide':
      return (
        <>
          <R x={87} y={54} w={18} h={20} fill={INK} />
          <R x={135} y={54} w={18} h={20} fill={INK} />
        </>
      );
    case 'sleep':
      return (
        <>
          <R x={88} y={64} w={16} h={5} fill={INK} />
          <R x={136} y={64} w={16} h={5} fill={INK} />
        </>
      );
    case 'happy':
      return (
        <g fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M89 58 L103 66 L89 74" />
          <path d="M151 58 L137 66 L151 74" />
        </g>
      );
    case 'spiral':
      return (
        <g fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round">
          <path d={spiralPath(96, 66)} />
          <path d={spiralPath(144, 66)} />
        </g>
      );
    case 'wink':
      return (
        <>
          <R x={89} y={58} w={14} h={16} fill={INK} />
          <path d="M137 62 Q144 71 151 62" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
        </>
      );
    case 'shades':
      return (
        <g>
          <rect x={82} y={56} width={24} height={18} rx={4} fill={INK} />
          <rect x={134} y={56} width={24} height={18} rx={4} fill={INK} />
          <rect x={104} y={62} width={30} height={4} fill={INK} />
          <rect x={86} y={59} width={6} height={3} rx={1} fill={WHITE} opacity={0.6} />
          <rect x={138} y={59} width={6} height={3} rx={1} fill={WHITE} opacity={0.6} />
        </g>
      );
  }
}

function Mouth({ mouth }: { mouth: ClawdMouth }) {
  if (mouth === 'line') return <rect x={104} y={98} width={32} height={4} rx={1} fill={INK} />;
  if (mouth === 'open') return <rect x={108} y={92} width={24} height={16} rx={4} fill={INK} />;
  if (mouth === 'kiss') return <ellipse cx={114} cy={100} rx={5} ry={4} fill={INK} />;
  return null;
}

function PixelHeart({ x, y, px = 5, fill }: { x: number; y: number; px?: number; fill: string }) {
  const G = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  return (
    <g>
      {G.flatMap((row, r) =>
        row.split('').map((c, col) =>
          c === 'X' ? (
            <rect key={`${r}-${col}`} x={x + col * px} y={y + r * px} width={px} height={px} fill={fill} />
          ) : null,
        ),
      )}
    </g>
  );
}

function Sparkle({ cx, cy, color, len = 12 }: { cx: number; cy: number; color: string; len?: number }) {
  return (
    <g>
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x={cx - 2}
          y={cy - len}
          width={4}
          height={len}
          rx={2}
          fill={color}
          transform={`rotate(${i * 45} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={3} fill={color} />
    </g>
  );
}

function Accessory({ kind, mono }: { kind: ClawdAccessory; mono?: boolean }) {
  const S = mono ? INK : 'none';
  const sw = mono ? 2 : 0;
  const surf = (c: string) => (mono ? WHITE : c);
  switch (kind) {
    case 'laptop':
      return (
        <g>
          <rect x={78} y={138} width={84} height={10} fill={surf('#8f8a80')} stroke={S} strokeWidth={sw} />
          <rect x={86} y={104} width={68} height={36} fill={surf('#c7c2b8')} stroke={S} strokeWidth={sw} />
          <rect x={90} y={108} width={60} height={28} fill={mono ? WHITE : '#3f3d39'} stroke={S} strokeWidth={sw} />
          <rect x={94} y={113} width={26} height={3} fill={mono ? INK : '#7fb96b'} />
          <rect x={94} y={120} width={38} height={3} fill={mono ? INK : '#cfc9bd'} />
          <rect x={94} y={127} width={20} height={3} fill={mono ? INK : '#cfc9bd'} />
        </g>
      );
    case 'coffee':
      return (
        <g>
          <rect x={196} y={78} width={22} height={22} fill={surf('#b7b1a6')} stroke={INK} strokeWidth={2} />
          <path d="M218 83 q10 1 10 8 q0 7 -10 8" fill="none" stroke={INK} strokeWidth={3} />
          <path
            d="M201 74 q3 -5 0 -9 M209 74 q3 -5 0 -9"
            fill="none"
            stroke={mono ? INK : '#cfc9bd'}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>
      );
    case 'ball':
      return (
        <g>
          <circle cx={172} cy={156} r={18} fill={WHITE} stroke={INK} strokeWidth={2} />
          <polygon points="172,147 180,153 177,163 167,163 164,153" fill={INK} />
          <path d="M158 150 l4 5 M186 150 l-4 5 M166 170 l3 -4 M178 170 l-3 -4" stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'wand':
      return (
        <g>
          <rect x={196} y={60} width={7} height={40} rx={2} fill={INK} transform="rotate(38 199 80)" />
          {[
            [222, 44],
            [230, 50],
            [214, 50],
            [226, 58],
            [218, 60],
            [234, 58],
            [228, 40],
            [236, 50],
            [210, 58],
          ].map(([x, y], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={6}
              height={6}
              fill={mono ? (i % 2 ? WHITE : INK) : i % 2 ? '#fff' : '#e0b34a'}
              stroke={mono ? INK : 'none'}
              strokeWidth={mono ? 1 : 0}
            />
          ))}
        </g>
      );
    case 'heart':
      return <PixelHeart x={200} y={62} px={5} fill={mono ? INK : '#e0533c'} />;
    default:
      return null;
  }
}

function Overhead({ kind, mono }: { kind: ClawdOverhead; mono?: boolean }) {
  const S = mono ? INK : 'none';
  const sw = mono ? 2 : 0;
  const surf = (c: string) => (mono ? WHITE : c);

  if (kind === 'sparkle-hat') {
    return (
      <g>
        <rect x={92} y={22} width={56} height={18} fill={surf(PURPLE)} stroke={S} strokeWidth={sw} />
        <rect x={104} y={6} width={32} height={16} fill={surf(PURPLE)} stroke={S} strokeWidth={sw} />
        <rect x={118.5} y={-38} width={3} height={46} fill={mono ? INK : STEEL} />
        <Sparkle cx={120} cy={-44} color={mono ? INK : SPARKLE} />
      </g>
    );
  }
  if (kind === 'party') {
    return (
      <g>
        <polygon points="120,4 102,44 138,44" fill={surf('#e0b34a')} stroke={INK} strokeWidth={2} />
        <circle cx={120} cy={4} r={5} fill={mono ? INK : '#e0533c'} />
        <circle cx={114} cy={22} r={3} fill={mono ? INK : '#fff'} />
        <circle cx={125} cy={32} r={3} fill={mono ? INK : '#e0533c'} />
      </g>
    );
  }
  if (kind === 'zzz') {
    return (
      <g fill={INK} fontFamily="monospace" fontWeight="bold">
        <text x={158} y={54} fontSize={14}>z</text>
        <text x={170} y={40} fontSize={18}>Z</text>
        <text x={186} y={24} fontSize={24}>Z</text>
      </g>
    );
  }
  if (kind === 'sun') {
    const cx = 202;
    const cy = 22;
    const r = 15;
    return (
      <g>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={cx - 1.5}
            y={cy - r - 10}
            width={3}
            height={8}
            rx={1.5}
            fill={mono ? INK : '#f2c14e'}
            transform={`rotate(${i * 45} ${cx} ${cy})`}
          />
        ))}
        <circle cx={cx} cy={cy} r={r} fill={surf('#f2c14e')} stroke={S} strokeWidth={sw} />
      </g>
    );
  }
  if (kind === 'umbrella') {
    const cx = 120;
    const cy = -6;
    const r = 44;
    return (
      <g>
        <rect x={cx - 1.5} y={-6} width={3} height={50} fill={mono ? INK : STEEL} />
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`}
          fill={surf('#4a86c8')}
          stroke={INK}
          strokeWidth={2}
        />
        <path
          d={`M${cx} ${cy - r} L${cx - r} ${cy} M${cx} ${cy - r} L${cx} ${cy} M${cx} ${cy - r} L${cx + r} ${cy}`}
          stroke={mono ? INK : '#2f6aa0'}
          strokeWidth={2}
        />
        <g stroke={mono ? INK : '#7cc4ff'} strokeWidth={3} strokeLinecap="round">
          <path d="M62 14 l0 8" />
          <path d="M178 20 l0 8" />
          <path d="M72 36 l0 8" />
          <path d="M172 6 l0 8" />
        </g>
      </g>
    );
  }
  return null;
}

export function ClaudeCharacter({
  mood,
  eyes,
  mouth,
  accessory = 'none',
  overhead = 'none',
  pulseKey = 0,
  size = 200,
  color,
  flat,
  outline,
  mono,
  frame = 'tight',
}: Props) {
  const body = mono ? WHITE : color ?? (mood ? moodColor(mood) : BASE);
  const eyeKind: ClawdEyes = eyes ?? (mood ? eyesFromMood(mood) : 'square');
  const mouthKind: ClawdMouth = mouth ?? (mood ? mouthFromMood(mood) : 'none');

  const tall = ['party', 'zzz', 'sparkle-hat', 'sun', 'umbrella'].includes(overhead);
  const viewBox =
    frame === 'wide'
      ? tall
        ? '0 -60 240 270'
        : '0 0 240 210'
      : tall
        ? '20 -55 200 240'
        : '32 7 176 176';

  const filterId = mono ? 'url(#ccMonoOutline)' : outline ? 'url(#ccSticker)' : undefined;

  return (
    <div style={{ width: size, height: size }} className="flex items-center justify-center">
      <svg viewBox={viewBox} width={size} height={size} shapeRendering="crispEdges">
        <defs>
          {!flat && !mono && (
            <radialGradient id="ccGlow" cx="50%" cy="52%" r="55%">
              <stop offset="0%" stopColor={body} stopOpacity="0.28" />
              <stop offset="100%" stopColor={body} stopOpacity="0" />
            </radialGradient>
          )}
          {outline && !mono && (
            <filter id="ccSticker" x="-25%" y="-25%" width="150%" height="150%">
              <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d" />
              <feFlood floodColor="#fff" result="w" />
              <feComposite in="w" in2="d" operator="in" result="o" />
              <feMerge>
                <feMergeNode in="o" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
          {mono && (
            <filter id="ccMonoOutline" x="-25%" y="-25%" width="150%" height="150%">
              <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d" />
              <feFlood floodColor={INK} result="w" />
              <feComposite in="w" in2="d" operator="in" result="o" />
              <feMerge>
                <feMergeNode in="o" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>
        {!flat && !mono && <rect x={0} y={0} width={240} height={210} fill="url(#ccGlow)" />}
        <g
          key={pulseKey}
          className={flat ? undefined : 'cc-pop'}
          style={{ transformOrigin: '120px 95px' }}
          filter={filterId}
        >
          <Overhead kind={overhead} mono={mono} />
          <R {...BODY} fill={body} />
          <R {...LARM} fill={body} />
          <R {...RARM} fill={body} />
          {LEGS.map((l, i) => (
            <R key={i} {...l} fill={body} />
          ))}
          <Eyes eyes={eyeKind} />
          <Mouth mouth={mouthKind} />
          <Accessory kind={accessory} mono={mono} />
        </g>
      </svg>
    </div>
  );
}
