import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useViewportMode } from './viewport';

/**
 * «Почему выбирают Звездач» — секция 1002:3656 (1392×720, радиус 63).
 *
 * Голубая плашка с тайловым паттерном, поверх — три записки на булавках.
 * Координаты из макета как есть; бумага, скотч и булавки выходят за свои
 * боксы, поэтому размеры картинок заданы отдельно от рамок (в Figma это
 * отрицательные inset'ы вокруг слоя).
 */

type Card = {
  paper: { left: number; top: number; w: number; h: number };
  glue: { left: number; top: number; w: number };
  /** crop — [left, top, размер] в % бокса: вторая и третья булавки вписаны со сдвигом */
  pin: { left: number; top: number; src: string; crop?: [number, number, number] };
  art: { left: number; top: number; w: number; h: number; src: string; pad: [number, number, number, number] };
  text: { left: number; top: number; center: boolean; titleW: number; descW: number };
  title: string;
  desc: string;
};

const CARDS: Card[] = [
  {
    paper: { left: 192.9, top: 96.6, w: 249.4, h: 240 },
    glue: { left: 194.6, top: 97, w: 248.3 },
    pin: { left: 294.89, top: 10, src: './img/why/pin1.png' },
    art: { left: 159, top: 126, w: 75.6, h: 69.9, src: './img/why/art1.svg', pad: [-2.08, -3.85, -6.24, -3.85] },
    text: { left: 235, top: 225.6, center: false, titleW: 152, descW: 167 },
    title: 'История покупок',
    desc: 'Находите прошлые заказы и повторяйте их',
  },
  {
    // 1075:2164: вторая записка переехала на 25 вправо и на 45 вверх
    paper: { left: 955.1, top: 33.6, w: 249.4, h: 240 },
    glue: { left: 956.6, top: 34, w: 248.5 },
    pin: { left: 1056.89, top: -53, src: './img/why/pin2.png', crop: [5.21, 5.07, 88.41] },
    art: { left: 928, top: 67, w: 61.07, h: 61.234, src: './img/why/art2.svg', pad: [-9.15, -11.32, -13.43, -11.32] },
    text: { left: 1079.5, top: 162.6, center: true, titleW: 191, descW: 201 },
    title: 'Отправляйте массово',
    desc: 'Отправляйте Stars сразу нескольким получателям за раз',
  },
  {
    paper: { left: 1027, top: 421.6, w: 249.4, h: 240 },
    glue: { left: 1028.5, top: 422, w: 248.5 },
    pin: { left: 1128.89, top: 337, src: './img/why/pin3.png', crop: [3.72, 2.9, 88.84] },
    art: { left: 1000, top: 450, w: 54, h: 75, src: './img/why/art3.svg', pad: [-3.64, -10.66, -4.04, -5.92] },
    text: { left: 1151.5, top: 550.6, center: true, titleW: 191, descW: 201 },
    title: 'Получите заказ сразу',
    desc: 'Заказ обрабатывается автоматически',
  },
];

/** Слой с отрицательными inset'ами: картинка крупнее своей рамки. */
function grown(box: { left: number; top: number; w: number; h: number }, pad: [number, number, number, number]) {
  const [t, r, b, l] = pad.map((v) => -v / 100);
  return {
    left: box.left - box.w * l,
    top: box.top - box.h * t,
    width: box.w * (1 + l + r),
    height: box.h * (1 + t + b),
  };
}

/** Заголовок набирается белым по мере скролла — строка за строкой. */
const TITLE_LINES = ['Почему тысячи', 'пользователей', 'выбирают Звездач'];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Всё в секции считается не от общего «прогресса блока», а от собственного
 * места элемента на экране: плашка высотой в целый экран, и единое окно
 * прогресса неизбежно промахивалось — записка вспыхивала посреди кадра, а
 * заголовок дозаливался, когда плашка уже уезжала вверх.
 *
 * Опорные точки на плашке по вертикали (координаты макета).
 */
const TITLE_Y = 360.5;
const NOTE_Y = CARDS.map((c) => c.paper.top);

/** Записка крепится, когда её место подходит к нижней кромке окна. */
const PIN_AT = 0.9;
/**
 * Заголовок набирается белым, пока едет отсюда и до 0.54 высоты экрана.
 * Верхняя граница выбрана так, чтобы последняя строка добеливалась, пока
 * плашка ещё целиком в кадре: на высоких окнах при более позднем финише
 * из-за нижней кромки уже выглядывала следующая секция.
 */
const FILL_FROM = 0.88;
const FILL_SPAN = 0.34;

type View = { grow: number; fill: number; on: boolean[] };

export default function Why() {
  const rootRef = useRef<HTMLElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef(1);
  const onRef = useRef(CARDS.map(() => false));
  const [fit, setFit] = useState(1); // подгон плашки под ширину окна
  const [view, setView] = useState<View>({ grow: 0.94, fill: 0, on: onRef.current });

  // Ниже десктопа записки идут колонкой: координат макета нет, качать их
  // вокруг булавки нечему, и вся замерочная петля не нужна.
  const flow = useViewportMode() !== 'desktop';

  useEffect(() => {
    const el = plateRef.current;
    if (!el) return;

    // Колонка: заголовок сразу белый, записки проявляются по очереди.
    if (flow) {
      const showAll = () => setView({ grow: 1, fill: TITLE_LINES.length, on: CARDS.map(() => true) });
      if (!('IntersectionObserver' in window)) { showAll(); return; }
      const io = new IntersectionObserver(
        (entries) => { if (entries.some((e) => e.isIntersecting)) { showAll(); io.disconnect(); } },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
      );
      io.observe(el);
      return () => io.disconnect();
    }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const b = el.getBoundingClientRect();
      const vh = window.innerHeight;

      // Плашка подрастает, пока въезжает в кадр. Считается от её верха, а
      // transform-origin у неё top center — обратной связи «масштаб влияет на
      // замер» тут нет.
      const grow = 0.94 + 0.06 * clamp01((vh - b.top) / (vh * 0.8));
      const s = fitRef.current * grow;

      // К моменту, когда заголовок доехал до середины экрана, он уже белый
      // целиком: дочитывать добеливающуюся строку не приходится.
      const titleY = b.top + TITLE_Y * s;
      const fill = clamp01((vh * FILL_FROM - titleY) / (vh * FILL_SPAN)) * TITLE_LINES.length;

      // Записка приезжает снизу, а не вспыхивает на пустом месте, — и обратно
      // на скролле вверх уже не снимается.
      const on = onRef.current.map((was, i) => was || b.top + NOTE_Y[i] * s < vh * PIN_AT);
      onRef.current = on;

      setView((v) =>
        v.grow === grow && v.fill === fill && v.on.every((x, i) => x === on[i])
          ? v
          : { grow, fill, on },
      );
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    // Плашка нарисована на 1392 и по краям должно оставаться по 24px.
    const fitToWindow = () => {
      const w = document.documentElement.clientWidth;
      fitRef.current = Math.min(1, (w - 48) / 1392);
      setFit(fitRef.current);
    };
    fitToWindow();
    window.addEventListener('resize', fitToWindow);
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('visibilitychange', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('resize', fitToWindow);
      document.removeEventListener('visibilitychange', onScroll);
    };
  }, [flow]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = root.querySelectorAll('.reveal'); // сейчас это только заголовок
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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section className="why" id="why" ref={rootRef} aria-labelledby="why-title"
             style={{ '--fit': fit } as CSSProperties}>
      <div
        className="why-plate"
        ref={plateRef}
        style={{ '--plate-scale': view.grow } as CSSProperties}
      >
        <div className="why-pattern" aria-hidden="true" />

        <h2 className="why-title reveal" id="why-title">
          {TITLE_LINES.map((line, i) => (
            <span
              className="why-title-line"
              key={line}
              style={{ '--p': `${clamp01(view.fill - i) * 100}%` } as CSSProperties}
            >
              {line}
            </span>
          ))}
        </h2>

        {CARDS.map((c, i) => {
          const paperImg = grown(c.paper, [-1.52, -2.92, -4.55, -2.92]);
          const artImg = grown({ ...c.art }, c.art.pad);
          return (
            <div
              className={`why-card${view.on[i] ? ' is-in' : ''}`}
              key={c.title}
              style={{
                '--d': `${i * 90}ms`,
                ...(flow ? null : {
                  '--sway': `${(i % 2 ? -1 : 1) * 0.55}deg`,
                  '--sway-t': `${7.5 + i * 1.3}s`,
                  // записка качается вокруг булавки, а не вокруг своего центра
                  '--ox': `${c.pin.left + 46}px`,
                  '--oy': `${c.pin.top + 40}px`,
                }),
              } as CSSProperties}
            >
              {/* булавка — точка, вокруг которой записка качается */}
              <div
                className={`why-pin${c.pin.crop ? ' is-cropped' : ''}`}
                style={{
                  ...(flow ? null : { left: c.pin.left, top: c.pin.top }),
                  ...(c.pin.crop && {
                    '--cx': `${c.pin.crop[0]}%`,
                    '--cy': `${c.pin.crop[1]}%`,
                    '--cs': `${c.pin.crop[2]}%`,
                  }),
                } as CSSProperties}
              >
                <img src={c.pin.src} alt="" />
              </div>

              <img
                className="why-paper"
                src="./img/why/paper.png"
                alt=""
                style={flow ? undefined : { left: paperImg.left, top: paperImg.top, width: paperImg.width, height: paperImg.height }}
              />
              <img
                className="why-glue"
                src="./img/why/glue.svg"
                alt=""
                style={flow ? undefined : { left: c.glue.left, top: c.glue.top, width: c.glue.w }}
              />
              <img
                className="why-art"
                src={c.art.src}
                alt=""
                style={flow ? undefined : { left: artImg.left, top: artImg.top, width: artImg.width, height: artImg.height }}
              />

              <div
                className="why-text"
                style={flow ? undefined : {
                  left: c.text.left,
                  top: c.text.top,
                  transform: c.text.center ? 'translate(-50%, -50%)' : 'translateY(-50%)',
                }}
              >
                <h3 style={flow ? undefined : { width: c.text.titleW }}>{c.title}</h3>
                <p style={flow ? undefined : { width: c.text.descW }}>{c.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
