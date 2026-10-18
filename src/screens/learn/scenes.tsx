import { Apple, Bag, Candy, ease, Kid, Plate, seg, Txt, type Scene } from '../../components/TimelinePlayer';

/** 式の数と、説明の色を そろえる（2 と「1さらに ある りんごの かず」が 同じ色） */
export const MUL_COLORS = { per: '#c0392b', groups: '#1f6fb8', total: '#6a3fb8' };
export const DIV_COLORS = { total: '#b8306b', people: '#1f6fb8', each: '#6a3fb8' };

interface EqToken {
  text: string;
  x: number;
  color: string;
  /** 説明の矢印を出すか */
  mark?: boolean;
}

const OP = '#33475b';
const MUL_EQ: EqToken[] = [
  { text: '2', x: 96, color: MUL_COLORS.per, mark: true },
  { text: '×', x: 138, color: OP },
  { text: '3', x: 180, color: MUL_COLORS.groups, mark: true },
  { text: '=', x: 222, color: OP },
  { text: '6', x: 264, color: MUL_COLORS.total, mark: true },
];
const DIV_EQ: EqToken[] = [
  { text: '10', x: 96, color: DIV_COLORS.total, mark: true },
  { text: '÷', x: 144, color: OP },
  { text: '2', x: 184, color: DIV_COLORS.people, mark: true },
  { text: '=', x: 224, color: OP },
  { text: '5', x: 264, color: DIV_COLORS.each, mark: true },
];

function EquationTokens({ tokens }: { tokens: EqToken[] }) {
  return (
    <g>
      {tokens.map((k) => (
        <Txt key={k.x} x={k.x} y={72} size={46} color={k.color}>
          {k.text}
        </Txt>
      ))}
    </g>
  );
}

/** 数の下に、同じ色の丸い目印と矢印（下の説明につながる） */
function EqArrows({ tokens, opacity }: { tokens: EqToken[]; opacity: number }) {
  return (
    <g opacity={opacity}>
      {tokens
        .filter((k) => k.mark)
        .map((k) => (
          <g key={k.x}>
            <path d={`M${k.x} 84 L${k.x} 112`} stroke={k.color} strokeWidth="4" strokeLinecap="round" />
            <path d={`M${k.x - 8} 104 L${k.x} 116 L${k.x + 8} 104`} stroke={k.color} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
    </g>
  );
}

/** 皿 i（0始まり）の x 座標（3皿・4皿で中央寄せ） */
const plateX = (i: number, n: number) => 180 + (i - (n - 1) / 2) * 92;

function ApplesOnPlate({ cx, y, n, appear = 1, glow = -1 }: { cx: number; y: number; n: number; appear?: number; glow?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, k) => {
        const a = seg(appear, k / n, (k + 1) / n);
        const off = (k - (n - 1) / 2) * 20;
        return a > 0 ? <Apple key={k} x={cx + off} y={y - 14 - (1 - ease(a)) * 40} s={1} glow={glow >= 0 && k <= glow} /> : null;
      })}
    </g>
  );
}

export const MUL_SCENES: Scene[] = [
  {
    dur: 8,
    caption: 'りんごが 2こ のった おさらが あるよ。',
    render: (t) => (
      <>
        <Plate x={180} y={140} opacity={ease(seg(t, 0, 0.2))} />
        <ApplesOnPlate cx={180} y={140} n={2} appear={seg(t, 0.2, 0.7)} />
        <Txt x={180} y={190} size={18} opacity={seg(t, 0.7, 0.9)}>
          1さらに 2こ
        </Txt>
      </>
    ),
  },
  {
    dur: 10,
    caption: 'おなじ おさらを ふやすよ。2こずつ、3さら。',
    render: (t) => (
      <>
        {[0, 1, 2].map((i) => {
          const a = i === 0 ? 1 : seg(t, 0.15 + (i - 1) * 0.3, 0.4 + (i - 1) * 0.3);
          return (
            <g key={i} opacity={a}>
              <Plate x={plateX(i, 3)} y={140} />
              <ApplesOnPlate cx={plateX(i, 3)} y={140} n={2} appear={a} />
              <Txt x={plateX(i, 3)} y={186} size={17} color="#33475b" weight={800}>
                {i + 1}さらめ
              </Txt>
            </g>
          );
        })}
      </>
    ),
  },
  {
    dur: 14,
    caption: 'ぜんぶで いくつ？ 2 + 2 + 2 = 6',
    render: (t) => {
      const step = Math.min(3, Math.floor(seg(t, 0.05, 0.75) * 3.999));
      const parts = ['2', '2', '2'].slice(0, step + 1);
      return (
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Plate x={plateX(i, 3)} y={130} />
              <ApplesOnPlate cx={plateX(i, 3)} y={130} n={2} glow={i <= step ? 1 : -1} />
              {i <= step && (
                <Txt x={plateX(i, 3)} y={168} size={16} color="#c0392b">
                  {(i + 1) * 2}
                </Txt>
              )}
            </g>
          ))}
          <Txt x={180} y={50} size={30}>
            {parts.join(' + ')}
            {t > 0.8 ? ' = 6' : ''}
          </Txt>
        </>
      );
    },
  },
  {
    dur: 12,
    caption: '「2こずつ」の まとまりが「3さら」ぶん あるね。',
    render: (t) => (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={plateX(i, 3) - 42} y={96} width={84} height={58} rx={14} fill="none" stroke="#7a55c8" strokeWidth="3" strokeDasharray="6 4" opacity={seg(t, 0.1 + i * 0.15, 0.25 + i * 0.15)} />
            <Plate x={plateX(i, 3)} y={140} />
            <ApplesOnPlate cx={plateX(i, 3)} y={140} n={2} />
          </g>
        ))}
        <Txt x={180} y={50} size={22} color="#7a55c8" opacity={seg(t, 0.55, 0.75)}>
          2こずつ が 3つぶん
        </Txt>
      </>
    ),
  },
  {
    dur: 14,
    caption: 'これを かけざんで「2 × 3 = 6」と かくよ。',
    render: (t) => {
      const m = ease(seg(t, 0.25, 0.6));
      return (
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Plate x={plateX(i, 3)} y={180} w={60} />
              <ApplesOnPlate cx={plateX(i, 3)} y={180} n={2} />
            </g>
          ))}
          <Txt x={180} y={50} size={26} opacity={1 - m}>
            2 + 2 + 2 = 6
          </Txt>
          <g opacity={m}>
            <EquationTokens tokens={MUL_EQ} />
          </g>
          <EqArrows tokens={MUL_EQ} opacity={seg(t, 0.55, 0.7)} />
        </>
      );
    },
    // 式の すぐ下（アニメの枠の下）に 大きな文字で 出す説明
    legend: [
      { value: '2', color: MUL_COLORS.per, label: '1さらに ある りんごの かず', at: 0.6 },
      { value: '3', color: MUL_COLORS.groups, label: 'おさらの かず', at: 0.7 },
      { value: '6', color: MUL_COLORS.total, label: 'ぜんぶの りんごの かず', at: 0.8 },
    ],
  },
  {
    dur: 12,
    caption: '「2 × 3」は「2 が 3つぶん」という いみ。',
    render: (t) => (
      <>
        <Txt x={180} y={70} size={44} color="#7a55c8">
          2 × 3
        </Txt>
        <Txt x={180} y={120} size={22} opacity={seg(t, 0.2, 0.4)}>
          ＝ 2 が 3つぶん
        </Txt>
        <Txt x={180} y={160} size={22} opacity={seg(t, 0.5, 0.7)}>
          ＝ 2 + 2 + 2
        </Txt>
        <Txt x={180} y={200} size={22} opacity={seg(t, 0.75, 0.9)} color="#c0392b">
          ＝ 6
        </Txt>
      </>
    ),
  },
  {
    dur: 12,
    caption: '3こずつ 4さら なら？ 3 × 4 = 12',
    render: (t) => (
      <>
        {[0, 1, 2, 3].map((i) => {
          const x = 180 + (i - 1.5) * 84;
          const a = seg(t, i * 0.12, 0.12 + i * 0.12);
          return (
            <g key={i} opacity={a}>
              <Plate x={x} y={150} w={76} />
              <ApplesOnPlate cx={x} y={150} n={3} appear={a} />
            </g>
          );
        })}
        <Txt x={180} y={60} size={30} opacity={seg(t, 0.55, 0.75)}>
          3 + 3 + 3 + 3 = 12
        </Txt>
        <Txt x={180} y={196} size={30} color="#7a55c8" opacity={seg(t, 0.8, 0.95)}>
          3 × 4 = 12
        </Txt>
      </>
    ),
  },
];

const KID_X = [100, 260];
const KID_COLORS = ['#4aa3df', '#ef7d57', '#5cc28b', '#a678de'];

export const DIV_SCENES: Scene[] = [
  {
    dur: 8,
    caption: 'あめが 10こ あるよ。',
    render: (t) => (
      <>
        {Array.from({ length: 10 }, (_, i) => (
          <g key={i} opacity={seg(t, i * 0.06, i * 0.06 + 0.1)}>
            <Candy x={70 + (i % 5) * 55} y={80 + Math.floor(i / 5) * 46} />
          </g>
        ))}
        <Txt x={180} y={196} size={22} opacity={seg(t, 0.7, 0.9)}>
          10こ
        </Txt>
      </>
    ),
  },
  {
    dur: 10,
    caption: '2にんで、おなじ かずずつ わけよう。',
    render: (t) => (
      <>
        {Array.from({ length: 10 }, (_, i) => (
          <Candy key={i} x={70 + (i % 5) * 55} y={50 + Math.floor(i / 5) * 40} s={0.9} />
        ))}
        {KID_X.map((x, k) => (
          <g key={k} opacity={seg(t, 0.2 + k * 0.2, 0.4 + k * 0.2)}>
            <Kid x={x} y={160} color={KID_COLORS[k]} />
          </g>
        ))}
      </>
    ),
  },
  {
    dur: 20,
    caption: '1こずつ、じゅんばんに くばるよ。',
    render: (t) => {
      const moved = seg(t, 0.05, 0.9) * 10;
      return (
        <>
          {KID_X.map((x, k) => (
            <g key={k}>
              <Kid x={x} y={150} color={KID_COLORS[k]} />
              <Plate x={x} y={205} w={110} />
            </g>
          ))}
          {Array.from({ length: 10 }, (_, i) => {
            const p = ease(Math.min(1, Math.max(0, moved - i)));
            const fromX = 70 + (i % 5) * 55;
            const fromY = 40 + Math.floor(i / 5) * 36;
            const kid = i % 2;
            const slot = Math.floor(i / 2);
            const toX = KID_X[kid] - 40 + slot * 20;
            const toY = 196;
            return <Candy key={i} x={fromX + (toX - fromX) * p} y={fromY + (toY - fromY) * p} s={0.8 - 0.25 * p} />;
          })}
        </>
      );
    },
  },
  {
    dur: 10,
    caption: 'ひとり 5こずつに なったね。おなじ かずだ！',
    render: (t) => (
      <>
        {KID_X.map((x, k) => (
          <g key={k}>
            <Kid x={x} y={110} color={KID_COLORS[k]} />
            <Plate x={x} y={190} w={120} />
            {Array.from({ length: 5 }, (_, s) => (
              <Candy key={s} x={x - 40 + s * 20} y={182} s={0.6} />
            ))}
            <Txt x={x} y={40} size={26} color="#c0392b" opacity={seg(t, 0.3 + k * 0.2, 0.5 + k * 0.2)}>
              5こ
            </Txt>
          </g>
        ))}
      </>
    ),
  },
  {
    dur: 12,
    caption: 'これを わりざんで「10 ÷ 2 = 5」と かくよ。',
    render: (t) => (
      <>
        <EquationTokens tokens={DIV_EQ} />
        <EqArrows tokens={DIV_EQ} opacity={seg(t, 0.25, 0.4)} />
        {[120, 240].map((x) => (
          <g key={x} opacity={seg(t, 0.1, 0.3)}>
            <Plate x={x} y={190} w={110} />
            {Array.from({ length: 5 }, (_, s) => (
              <Candy key={s} x={x - 40 + s * 20} y={182} s={0.6} />
            ))}
          </g>
        ))}
      </>
    ),
    legend: [
      { value: '10', color: DIV_COLORS.total, label: 'ぜんぶの あめの かず', at: 0.35 },
      { value: '2', color: DIV_COLORS.people, label: 'わける ひとの かず', at: 0.5 },
      { value: '5', color: DIV_COLORS.each, label: 'ひとりぶんの あめの かず', at: 0.65 },
    ],
  },
  {
    dur: 14,
    caption: 'ちがう わけかた：12こを 3こずつ ふくろに いれると 4ふくろ。12 ÷ 3 = 4',
    render: (t) => {
      const bags = Math.min(4, Math.floor(seg(t, 0.05, 0.7) * 4.999));
      return (
        <>
          {[0, 1, 2, 3].map((b) => {
            const x = 180 + (b - 1.5) * 82;
            return (
              <g key={b}>
                <Bag x={x} y={150} opacity={b < bags ? 1 : 0.25} />
                {b < bags && [0, 1, 2].map((k) => <Candy key={k} x={x - 14 + k * 14} y={160 - (k % 2) * 10} s={0.55} />)}
              </g>
            );
          })}
          <Txt x={180} y={60} size={22}>
            3こずつ → {bags}ふくろ
          </Txt>
          <Txt x={180} y={210} size={28} color="#7a55c8" opacity={seg(t, 0.75, 0.9)}>
            12 ÷ 3 = 4
          </Txt>
        </>
      );
    },
  },
  {
    dur: 10,
    caption: 'かけざんで たしかめよう。2 × 5 = 10 だから、10 ÷ 2 = 5。',
    render: (t) => (
      <>
        <Txt x={180} y={80} size={36}>
          2 × 5 = 10
        </Txt>
        <Txt x={180} y={130} size={22} color="#4b5d72" opacity={seg(t, 0.25, 0.45)}>
          だから
        </Txt>
        <Txt x={180} y={180} size={36} color="#7a55c8" opacity={seg(t, 0.5, 0.7)}>
          10 ÷ 2 = 5
        </Txt>
      </>
    ),
  },
];
