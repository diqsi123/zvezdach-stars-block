import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { HAS_CLOUDS } from './variant';

/**
 * «Получайте процент с покупок» — секция 1100:2844 (1440×628, y=3404).
 *
 * Редакция от 1100:2844: карточки выровнены в ряд по 24px, без наклона,
 * без «дырок» в углах и без соединяющих лямок — вся прежняя механика
 * физлайна (прорисовка по скроллу, провисание под весом карточки, пружина
 * за курсором) из макета убрана вместе с самими лямками.
 *
 * Геометрия из макета: заголовок по центру на y=59, группа карточек 1084×326
 * на (178,174) — ровно по центру полотна, — ряд внутри неё отбит сверху на
 * 18.74px, кнопка на y=572.
 */

const TITLE_LINES = ['Получайте процент', 'с покупок'];

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
  art: Art;
  textBottom: number;
  titleW?: number;
  title: string;
  desc: ReactNode;
};

const CARDS: Card[] = [
  {
    art: {
      box: { left: 53, top: -3.74, w: 213.13, h: 146.389 },
      pad: [-4.03, -6.39, -8.85, -5],
      src: './img/percent/art1.svg',
    },
    textBottom: 24,
    title: '30% с покупок',
    desc: 'Получайте процент с каждого оплаченного заказа',
  },
  {
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

export default function Percent() {
  const rootRef = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  /**
   * Раньше появление вело себя как хореография вокруг лямок и считалось
   * покадрово от прогресса скролла. Лямок в макете больше нет, тянуть ради
   * ряда карточек rAF-петлю незачем: заголовок и карточки заходят по очереди,
   * разбег задаёт --d.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setShown(true);
        io.disconnect();
      },
      { rootMargin: '0px 0px -15% 0px', threshold: 0.05 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  const on = shown ? ' is-in' : '';

  return (
    <section className="percent" id="percent" ref={rootRef} aria-labelledby="percent-title">
      {HAS_CLOUDS && (
        <img className="percent-clouds" src="./img/percent/clouds.svg" alt="" aria-hidden="true" />
      )}

      <h2 className={`percent-title${on}`} id="percent-title">
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
              className={`percent-card${on}`}
              key={c.title}
              style={{ '--d': `${180 + i * 90}ms` } as CSSProperties}
            >
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
          );
        })}
      </div>

      <a className={`percent-more${on}`} href="#" style={{ '--d': '470ms' } as CSSProperties}>
        <span className="percent-more-wave" aria-hidden="true" />
        <span className="percent-more-label">подробнее</span>
      </a>
    </section>
  );
}
