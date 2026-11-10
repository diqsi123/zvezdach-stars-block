import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useViewportMode } from './viewport';
import { HAS_CLOUDS } from './variant';

/**
 * «Как проходит покупка» — секция 1002:3403 (1440×1494).
 *
 * Геометрия из макета: заголовок по центру на y=59, вертикальная линия
 * x=716 / y=182 высотой 1188, три шага на y=404 / 843 / 1283. Линия разбита
 * на три отрезка с разрывами там, где её перекрывает пилюля шага (308–348 и
 * 748–787 в координатах линии) — так нарисовано в Figma.
 *
 * Прогресс и искры — одна система, а не «полоса плюс декоративные звёздочки»:
 * длина синей линии жёстко привязана к скроллу секции (вверх — сокращается),
 * а искры рождаются только там, где прямо сейчас прошёл её нижний край, и
 * гаснут, стоит краю уйти дальше. Никакого автоплея по таймеру.
 */

const LINE_H = 1188;

/** Отрезки линии в её собственных координатах: [начало, конец]. */
const SEGMENTS: [number, number][] = [
  [8, 308],
  [348, 748],
  [787, 1188],
];

/** Сколько линии должно быть залито, чтобы шаг считался пройденным. */
const STEP_AT = [308, 748, 1188];

/* ── искры ────────────────────────────────────────────────────────────────
   Живут коротко и почти не двигаются: появляются рядом с краем заливки,
   держатся мгновение и растворяются. Одновременно видно 3–7 штук.        */

const TRAIL_ZONE = 165; // насколько далеко от края искра ещё видна, px
const SPAWN_PER_PX = 0.055; // ~одна искра на 18px хода края
const MAX_SPARKS = 8;
const SIZES = [6, 7, 7, 8, 9, 9, 11, 14]; // крупные — редко

type Spark = {
  id: number;
  y: number;
  x: number;
  size: number;
  rot: number;
  drift: number;
  plus: boolean; // половина искр — крестики, половина — четырёхлучевые
  born: number;
  life: number;
};

const STAGES = [
  {
    top: 404,
    art: './img/steps/stage1.png',
    // Размер — натуральный экспорт, сдвиг посчитан по эталонному рендеру:
    // совмещены центры видимой части иллюстрации и рамки 236×213 из макета.
    artStyle: { width: 308, height: 243.5, left: -47, top: -20.75 },
    badge: 'Первый шаг',
    icon: './img/steps/badge1.svg',
    title: 'Выберите товар',
    text: 'Выберите, что хотите отправить: Stars, Премиум, Gifts или подписку. Настройте количество и параметры заказа за несколько секунд.',
  },
  {
    top: 843,
    art: './img/steps/stage2.png',
    artStyle: { width: 236, height: 217.5, left: -0.5, top: -4.25 },
    badge: 'Второй шаг',
    icon: './img/steps/badge2.svg',
    title: 'Введите Username',
    text: 'Укажите Telegram Username получателя, которому хотите отправить выбранный товар. Проверьте правильность имени перед продолжением.',
  },
  {
    top: 1283,
    art: './img/steps/stage3.png',
    artStyle: { width: 240, height: 213, left: -13.5, top: 3 },
    badge: 'Третий шаг',
    icon: './img/steps/badge3.svg',
    title: 'Оплатите заказ',
    text: 'Выберите удобный способ оплаты: криптовалютой, банковской картой или через СБП. После оплаты заказ будет автоматически отправлен получателю.',
  },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export default function Steps() {
  const rootRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(0);
  const [sparks, setSparks] = useState<Spark[]>([]);

  // Ниже десктопа шаги идут колонкой: вертикальной линии между ними нет,
  // а значит нет ни заливки, ни искр — вся rAF-петля отключается.
  const flow = useViewportMode() !== 'desktop';

  // Появление блоков: один наблюдатель на секцию, срабатывает один раз.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = root.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // Без линии заливать нечего: пилюли шагов сразу в акцентном состоянии.
    if (flow) { setFilled(LINE_H); setSparks([]); return; }

    const el = lineRef.current;
    if (!el) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let edge = 0; // сглаженное значение, его и рисуем
    let target = 0; // чистый прогресс скролла
    let prevEdge = 0;
    let budget = 0;
    let seq = 0;
    let live: Spark[] = [];
    let raf = 0;
    let prevTime = 0;

    // Лёгкое сглаживание: постоянная времени ~90 мс. Достаточно, чтобы
    // движение не выглядело рубленым, и мало, чтобы линия не отставала
    // от скролла заметно на глаз.
    const SMOOTH_BASE = Math.exp(-1 / 0.09);

    const readEdge = () => {
      const b = el.getBoundingClientRect();
      // Ориентир — точка чуть выше середины экрана: заливка идёт вровень
      // с тем шагом, который читатель как раз читает.
      return clamp01((window.innerHeight * 0.62 - b.top) / b.height) * LINE_H;
    };

    /** Рядом с шагом след ненадолго оживает — «энергия дошла до этапа». */
    const nearStep = (y: number) =>
      STEP_AT.some((s) => Math.abs(s - y) < 60) ? 2.1 : 1;

    const spawn = (now: number, dir: number) => {
      if (live.length >= MAX_SPARKS) return;
      // чуть выше края (позади хода) и вразнобой по сторонам
      const behind = rand(0, 30) * (dir >= 0 ? -1 : 1);
      const side = Math.random() < 0.5 ? -1 : 1;
      const away = Math.random() < 0.18 ? rand(0, 6) : rand(10, 54); // иногда почти поверх линии
      live.push({
        id: ++seq,
        y: edge + behind,
        x: side * away,
        size: SIZES[(Math.random() * SIZES.length) | 0],
        rot: rand(-45, 45),
        drift: rand(-4, -1.5),
        plus: Math.random() < 0.45,
        born: now,
        life: rand(680, 1120),
      });
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;

      edge += (target - edge) * (1 - Math.pow(SMOOTH_BASE, dt));
      if (Math.abs(target - edge) < 0.2) edge = target;
      setFilled(edge);

      const moved = edge - prevEdge;
      prevEdge = edge;

      if (!reduce && Math.abs(moved) > 0.05) {
        budget += Math.abs(moved) * SPAWN_PER_PX * nearStep(edge);
        while (budget >= 1) {
          budget -= 1;
          spawn(now, moved);
        }
      } else {
        budget = 0; // скролл встал — новые искры не копим
      }

      live = live.filter((s) => now - s.born < s.life);
      setSparks(live.slice());

      // Крутимся, пока есть что гасить или пока линия ещё догоняет скролл.
      if (live.length || edge !== target) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf) {
        prevTime = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const onScroll = () => {
      target = readEdge();
      if (reduce) {
        edge = target;
        setFilled(edge);
        return;
      }
      kick();
    };

    target = readEdge();
    edge = target;
    prevEdge = target;
    setFilled(target);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // В фоновой вкладке rAF не тикает — пересчитываем при возврате.
    document.addEventListener('visibilitychange', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('visibilitychange', onScroll);
    };
  }, [flow]);

  const started = filled > 2;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;

  return (
    <section className="steps" id="how" ref={rootRef} aria-labelledby="steps-title">
      {/* облака из макета: верхний слой и нижний, отражённый по горизонтали */}
      {HAS_CLOUDS && (
        <div className="steps-clouds" aria-hidden="true">
          <img className="steps-clouds-t" src="./img/steps/clouds-t.svg" alt="" />
          <img className="steps-clouds-b" src="./img/steps/clouds-b.svg" alt="" />
        </div>
      )}

      <h2 className="steps-title reveal" id="steps-title">
        Как проходит покупка
      </h2>

      {!flow && <div className="steps-line" ref={lineRef} aria-hidden="true">
        <span className={`steps-dot${started ? ' is-on' : ''}`} />

        {SEGMENTS.map(([a, b]) => (
          <span key={a} className="steps-seg" style={{ top: a, height: b - a }}>
            <span
              className="steps-seg-fill"
              style={{ transform: `scaleY(${clamp01((filled - a) / (b - a))})` }}
            />
          </span>
        ))}

        {sparks.map((s) => (
          <SparkMark key={s.id} s={s} now={now} edge={filled} />
        ))}
      </div>}

      {STAGES.map((s, i) => (
        <div
          className="steps-row reveal"
          style={{
            '--d': `${i * 40}ms`,
            ...(flow ? null : {
              top: s.top,
              // у каждого стикера своё время качания, чтобы они не ходили строем
              '--float-t': `${6.4 + i * 1.1}s`,
              '--float-d': `${-i * 1.7}s`,
            }),
          } as CSSProperties}
          key={s.badge}
        >
          <span className="steps-art">
            <img src={s.art} alt="" style={flow ? undefined : (s.artStyle as CSSProperties)} />
          </span>

          <div className={`steps-badge${filled >= STEP_AT[i] ? ' is-accent' : ''}`}>
            <i style={{ '--icon': `url(${s.icon})` } as CSSProperties} />
            <span>{s.badge}</span>
          </div>

          <div className="steps-text">
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Жизнь одной искры: выступила → мгновение держится → растворилась.
 * Плюс затухание по расстоянию до края заливки, чтобы след не растягивался
 * на всю пройденную линию.
 */
function SparkMark({ s, now, edge }: { s: Spark; now: number; edge: number }) {
  const t = clamp01((now - s.born) / s.life);

  // 0 → 1 за первую четверть, держим, к концу гаснем
  const fade = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
  const near = 1 - clamp01(Math.abs(s.y - edge) / TRAIL_ZONE);
  const opacity = clamp01(fade) * near;
  if (opacity <= 0.01) return null;

  const scale = t < 0.25 ? 0.5 + 0.5 * (t / 0.25) : 1 - 0.14 * ((t - 0.25) / 0.75);

  return (
    <svg
      className="steps-spark"
      style={{
        top: s.y - s.size / 2 + s.drift * t,
        left: s.x + 4 - s.size / 2,
        width: s.size,
        height: s.size,
        opacity,
        rotate: `${s.rot}deg`,
        scale,
      }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {s.plus ? (
        // крестик
        <path
          d="M12 2c.35 4.2 2.8 6.6 10 7-7.2.4-9.65 2.8-10 7-.35-4.2-2.8-6.6-10-7 7.2-.4 9.65-2.8 10-7z"
          fill="currentColor"
        />
      ) : (
        // четырёхлучевая звёздочка
        <path
          d="M12 0c.7 6.3 4.9 10.6 12 12-7.1 1.4-11.3 5.7-12 12-.7-6.3-4.9-10.6-12-12C7.1 10.6 11.3 6.3 12 0z"
          fill="currentColor"
        />
      )}
    </svg>
  );
}
