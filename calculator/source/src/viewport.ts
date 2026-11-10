import { useEffect, useState } from 'react';

/**
 * Брейкпоинты адаптива. Единственное место, где эти числа заданы: те же
 * значения подставляются в медиазапросы в styles.css — расходиться им нельзя,
 * иначе JS отдаст мобильную разметку, а CSS отрисует её десктопными правилами.
 *
 * DESKTOP_MIN — граница, ниже которой мы перестаём ужимать страницу зумом и
 * переходим на настоящую перевёрстку. Выше неё всё работает ровно как раньше:
 * 1:1 от 1440 и пропорциональный zoom на 1200–1440. Десктоп не трогаем.
 */
export const DESKTOP_MIN = 1200;
export const MOBILE_MAX = 719;

export type Mode = 'desktop' | 'tablet' | 'mobile';

export function modeFor(width: number): Mode {
  if (width >= DESKTOP_MIN) return 'desktop';
  return width <= MOBILE_MAX ? 'mobile' : 'tablet';
}

/**
 * Ширину берём из clientWidth документа, а не из innerWidth: innerWidth
 * включает вертикальную полосу прокрутки, и на границе брейкпоинта режим
 * прыгал бы туда-обратно вместе с появлением полосы.
 */
export function viewportWidth() {
  return document.documentElement.clientWidth || window.innerWidth;
}

/** Текущий режим раскладки. Пересчитывается на resize и на смене ориентации. */
export function useViewportMode(): Mode {
  const [mode, setMode] = useState<Mode>(() =>
    typeof document === 'undefined' ? 'desktop' : modeFor(viewportWidth()),
  );

  useEffect(() => {
    const read = () => setMode((prev) => {
      const next = modeFor(viewportWidth());
      return next === prev ? prev : next;
    });
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
    };
  }, []);

  return mode;
}

/**
 * Тяжёлую анимацию на телефонах не тянем: WebGL-фон, искры, пружины лямок.
 * Сюда же попадает системное «уменьшить движение» — правило одно на оба случая.
 */
export function useLightMotion(): boolean {
  const mode = useViewportMode();
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setReduce(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  return mode === 'mobile' || reduce;
}
