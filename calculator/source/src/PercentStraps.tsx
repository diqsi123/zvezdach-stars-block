import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useViewportMode } from './viewport';
import { HAS_CLOUDS } from './variant';

/**
 * «Получайте процент с покупок» — первая редакция (1002:3607), версия v1.
 *
 * Отличие от 1100:2844: карточки лежат под ∓2°, в углах у них «дырки» (Dot),
 * а между ними натянуты лямки — «physical line» 1002:3652. Лямки не картинка,
 * а две кривые Безье: их концы садятся ровно в дырки соседних карточек, и на
 * этом держится вся хореография секции.
 *
 * Появление привязано к скроллу, а не к таймеру:
 *   заголовок → первая карточка → лямка тянется к следующей → на её конце
 *   проявляется карточка и своим весом продавливает лямку вниз → лямка
 *   отыгрывает обратно. Дальше блок стоит; живут только лямки, которые
 *   тянутся за курсором.
 *
 * Прогресс сглаживается по времени (SMOOTH): скролл колёсиком приходит рывками
 * по 100+px, и без сглаживания лямка рисовалась бы ступеньками.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const TITLE_LINES = ['Получайте процент', 'с покупок'];

/* ── карточки ────────────────────────────────────────────────────────────── */

type Art = {
  /** рамка из макета в координатах карточки 334×298 */
  box: { left: number; top: number; w: number; h: number };
  /** отрицательные inset'ы картинки вокруг рамки, % */
  pad: [number, number, number, number];
  src: string;
  /** третья иллюстрация лежит в рамке повёрнутой */
  inner?: { w: number; h: number; rot: number };
};

type Card = {
  /** внешняя рамка в координатах группы 1084×326 */
  box: { left: number; top: number; w: number; h: number };
  rot: number;
  /** «дырки» в углах: к ним крепятся лямки */
  dots: { x: number; y: number }[];
  art: Art;
  textBottom: number;
  titleW?: number;
  title: string;
  desc: ReactNode;
};

const CARDS: Card[] = [
  {
    box: { left: 0, top: 0, w: 344.197, h: 309.475 },
    rot: -2,
    dots: [{ x: 297.108, y: 18.64 }],
    art: {
      box: { left: 48.487, top: -11.33, w: 217.647, h: 142.514 },
      pad: [-4.43, -6.25, -10.65, -4.67],
      src: './img/percent/art1-40.svg',
    },
    textBottom: 24,
    title: '40% с покупок',
    desc: 'Получайте процент с каждого оплаченного заказа',
  },
  {
    box: { left: 375.1, top: 27.74, w: 334, h: 298 },
    rot: 0,
    dots: [
      { x: 18.27, y: 18.25 },
      { x: 296.738, y: 18.25 },
    ],
    art: {
      box: { left: 75.45, top: -13.37, w: 199.444, h: 155.43 },
      pad: [-4.65, 0, 0, -3.01],
      src: './img/percent/art2.svg',
    },
    textBottom: 32,
    titleW: 257.489,
    title: 'Быстрый вывод',
    desc: 'Получайте заработанные средства быстро и без долгого ожидания',
  },
  {
    box: { left: 739, top: 13, w: 344.197, h: 309.475 },
    rot: 2,
    dots: [{ x: 18.64, y: 18.64 }],
    art: {
      box: { left: 76.243, top: -11.86, w: 191.874, h: 136.596 },
      inner: { w: 173.342, h: 87.667, rot: -17.86 },
      pad: [-14.49, -8.21, -17.97, -8.21],
      src: './img/percent/art3.svg',
    },
    textBottom: 32,
    title: 'Без ограничений',
    desc: (
      <>
        Приглашайте сколько угодно друзей
        <br />и зарабатывайте больше
      </>
    ),
  },
];

/** Слой с отрицательными inset'ами: картинка крупнее своей рамки. */
function grown(box: { w: number; h: number }, pad: [number, number, number, number]) {
  const [t, r, b, l] = pad.map((v) => -v / 100);
  return {
    left: -box.w * l,
    top: -box.h * t,
    width: box.w * (1 + l + r),
    height: box.h * (1 + t + b),
  };
}

/* ── лямки ───────────────────────────────────────────────────────────────── */

/**
 * Кубические кривые физлайна как есть, в координатах его коробки 473×42.11.
 * Вторая опорная точка у обеих совпадает с концом — так нарисовано в Figma,
 * поэтому смещать её можно свободно: конец кривой от этого не сдвинется, а
 * подход к дырке становится более пологим или, наоборот, провисает.
 */
const STRAPS = [
  { p0: [2.0, 2.0], c1: [38.28, 62.746], c2: [97.5, 29.0], p3: [97.5, 29.0], mid: [63.36, 38.28] },
  { p0: [376, 29.0], c1: [431.5, 60.5], c2: [471, 15.0], p3: [471, 15.0], mid: [444.31, 33.81] },
] as const;

/** Смещение к концу кривой гасим — тянется в основном её середина. */
const C2_WEIGHT = 0.6;

const strapPath = (i: number, ox: number, oy: number) => {
  const s = STRAPS[i];
  return (
    `M${s.p0[0]} ${s.p0[1]}` +
    `C${s.c1[0] + ox} ${s.c1[1] + oy}` +
    ` ${s.c2[0] + ox * C2_WEIGHT} ${s.c2[1] + oy * C2_WEIGHT}` +
    ` ${s.p3[0]} ${s.p3[1]}`
  );
};

/* ── тайминги ────────────────────────────────────────────────────────────── */

/** Куда доходит прогресс к моменту, когда включается очередной элемент. */
const STAGE_AT = [0.03, 0.09, 0.423, 0.683, 0.78];

/** Окна прорисовки лямок в том же прогрессе. */
const DRAW_AT: [number, number][] = [
  [0.15, 0.44],
  [0.42, 0.7],
];

/** Постоянная времени сглаживания прогресса, с. */
const SMOOTH = 0.11;

/** Пружина лямки: заметно недодемпфирована, чтобы отыгрывала с одним качком. */
const SPRING_K = 150;
const SPRING_C = 13;

/** Курсор тянет лямку не дальше этого и только вблизи. */
const PULL_MAX = 8;
const PULL_R = 150;

/** Толчок вниз в момент, когда на конце лямки повисает карточка. */
const SAG_KICK = 34;

export default function PercentStraps() {
  const rootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [stage, setStage] = useState(0);

  // Ниже десктопа карточки идут колонкой: лямкам между ними держаться не за
  // что, и вся пружинная механика вместе с ними отключается.
  const flow = useViewportMode() !== 'desktop';

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Колонка: ни рисовать лямки, ни крутить rAF незачем — карточки просто
    // проявляются по очереди, разбег задаёт --d в CSS.
    if (flow) {
      if (!('IntersectionObserver' in window)) { setStage(5); return; }
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          setStage(5);
          io.disconnect();
        },
        { rootMargin: '0px 0px -15% 0px', threshold: 0.05 },
      );
      io.observe(root);
      return () => io.disconnect();
    }

    const svg = svgRef.current;
    if (!svg) return;

    const paths = pathRefs.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      setStage(STAGE_AT.length);
      paths.forEach((p, i) => {
        if (!p) return;
        p.style.strokeDashoffset = '0';
        p.setAttribute('d', strapPath(i, 0, 0));
      });
      return;
    }

    let p = 0; // сглаженный прогресс, его и рисуем
    let target = 0;
    let stageNow = 0;
    const drawn = [0, 0]; // только вперёд: назад лямка не разбирается
    const bend = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 0, y: 0, vx: 0, vy: 0 },
    ];
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    let prev = 0;

    const readTarget = () => {
      const b = root.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 — секция только показалась снизу, 1 — она уже почти вся в кадре.
      return clamp01((vh * 0.85 - b.top) / (vh * 0.7));
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min((now - prev) / 1000, 1 / 30);
      prev = now;

      p += (target - p) * (1 - Math.exp(-dt / SMOOTH));
      if (Math.abs(target - p) < 0.0004) p = target;

      // этап только растёт: карточки, раз появившись, обратно не убираются
      const wasStage = stageNow;
      while (stageNow < STAGE_AT.length && p >= STAGE_AT[stageNow]) {
        stageNow += 1;
        // карточка повисла на конце лямки — та проседает под её весом
        const strap = stageNow - 3;
        if (strap === 0 || strap === 1) bend[strap].vy += SAG_KICK;
      }
      if (stageNow !== wasStage) setStage(stageNow);

      let awake = p !== target;

      // курсор в координатах коробки лямок
      let px = 0;
      let py = 0;
      let hasPointer = false;
      if (pointer) {
        const r = svg.getBoundingClientRect();
        if (r.width > 0) {
          px = ((pointer.x - r.left) / r.width) * 473;
          py = ((pointer.y - r.top) / r.height) * 42.1088;
          hasPointer = true;
        }
      }

      for (let i = 0; i < STRAPS.length; i += 1) {
        const [a, b] = DRAW_AT[i];
        const raw = clamp01((p - a) / (b - a));
        const eased = 1 - Math.pow(1 - raw, 1.8);
        if (eased > drawn[i]) drawn[i] = eased;

        const el = paths[i];
        if (!el) continue;
        el.style.strokeDashoffset = String(1 - drawn[i]);

        // тянется только та лямка, что уже натянута до конца
        const live = drawn[i] > 0.999 ? 1 : 0;
        let tx = 0;
        let ty = 0;
        if (hasPointer && live) {
          const dx = px - STRAPS[i].mid[0];
          const dy = py - STRAPS[i].mid[1];
          const d = Math.hypot(dx, dy);
          if (d > 0.5 && d < PULL_R) {
            const k = Math.pow(1 - d / PULL_R, 1.6) * PULL_MAX;
            tx = (dx / d) * k;
            ty = (dy / d) * k;
          }
        }

        const sp = bend[i];
        sp.vx += (SPRING_K * (tx - sp.x) - SPRING_C * sp.vx) * dt;
        sp.vy += (SPRING_K * (ty - sp.y) - SPRING_C * sp.vy) * dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;

        const settled =
          Math.abs(sp.x - tx) < 0.02 && Math.abs(sp.y - ty) < 0.02 &&
          Math.abs(sp.vx) < 0.02 && Math.abs(sp.vy) < 0.02;
        if (settled) {
          sp.x = tx; sp.y = ty; sp.vx = 0; sp.vy = 0;
        } else {
          awake = true;
        }

        el.setAttribute('d', strapPath(i, sp.x, sp.y));
      }

      if (awake) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf) {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const onScroll = () => { target = readTarget(); kick(); };

    // Курсор слушаем только пока секция в кадре: за её пределами лямки всё
    // равно вне зоны действия, а лишний rAF крутить незачем.
    const onPointer = (e: PointerEvent) => {
      const b = root.getBoundingClientRect();
      if (b.bottom < 0 || b.top > window.innerHeight) {
        if (pointer) { pointer = null; kick(); }
        return;
      }
      pointer = { x: e.clientX, y: e.clientY };
      kick();
    };
    const onLeave = () => { pointer = null; kick(); };

    target = readTarget();
    p = target;
    kick();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    // в фоновой вкладке rAF не тикает — пересчитываем при возврате
    document.addEventListener('visibilitychange', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onScroll);
    };
  }, [flow]);

  return (
    <section className="percent is-strapped" id="percent" ref={rootRef} aria-labelledby="percent-title">
      {HAS_CLOUDS && (
        <img className="percent-clouds" src="./img/percent/clouds.svg" alt="" aria-hidden="true" />
      )}

      <h2 className={`percent-title${stage >= 1 ? ' is-in' : ''}`} id="percent-title">
        {TITLE_LINES.map((line, i) => (
          <span className="percent-title-line" key={line} style={{ '--d': `${i * 90}ms` } as CSSProperties}>
            {line}
          </span>
        ))}
      </h2>

      <div className="percent-cards">
        {CARDS.map((c, i) => {
          const img = grown(c.art.inner ?? c.art.box, c.art.pad);
          return (
            <div
              className={`percent-card${stage >= i + 2 ? ' is-in' : ''}`}
              key={c.title}
              style={
                flow
                  ? ({ '--d': `${i * 90}ms` } as CSSProperties)
                  : { left: c.box.left, top: c.box.top, width: c.box.w, height: c.box.h }
              }
            >
              <div className="percent-card-in" style={flow ? undefined : { rotate: `${c.rot}deg` }}>
                {c.dots.map((d) => (
                  <img
                    className="percent-dot"
                    key={`${d.x}`}
                    src="./img/percent/dot.svg"
                    alt=""
                    style={{ left: d.x, top: d.y }}
                  />
                ))}

                <div
                  className="percent-art"
                  style={{ left: c.art.box.left, top: c.art.box.top, width: c.art.box.w, height: c.art.box.h }}
                >
                  {c.art.inner ? (
                    <div
                      className="percent-art-rot"
                      style={{ width: c.art.inner.w, height: c.art.inner.h, rotate: `${c.art.inner.rot}deg` }}
                    >
                      <img src={c.art.src} alt="" style={img} />
                    </div>
                  ) : (
                    <img src={c.art.src} alt="" style={img} />
                  )}
                </div>

                <div className="percent-text" style={{ bottom: c.textBottom }}>
                  <h3 style={c.titleW ? { width: c.titleW } : undefined}>{c.title}</h3>
                  <p>{c.desc}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Лямки поверх карточек: их концы садятся ровно в дырки.
            В колонке концам садиться некуда — лямок просто нет. */}
        {!flow && (
          <svg
            className="percent-straps"
            ref={svgRef}
            viewBox="0 0 473 42.1088"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            {STRAPS.map((s, i) => (
              <path
                key={s.p0[0]}
                ref={(el) => { pathRefs.current[i] = el; }}
                d={strapPath(i, 0, 0)}
                pathLength={1}
                stroke="#1DB1EE"
                strokeWidth={4}
                strokeLinecap="round"
              />
            ))}
          </svg>
        )}
      </div>

      <a className={`percent-more${stage >= 5 ? ' is-in' : ''}`} href="#">
        <span className="percent-more-wave" aria-hidden="true" />
        <span className="percent-more-label">подробнее</span>
      </a>
    </section>
  );
}
