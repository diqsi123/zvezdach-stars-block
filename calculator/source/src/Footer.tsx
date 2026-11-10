import { useEffect, useRef, useState } from 'react';
import Background from './Background';
import { useLightMotion } from './viewport';

/**
 * Футер — секция 1100:3041 (1440×637, y=4903).
 *
 * Фон «BG / Light + dots» (1100:3042) — это ровно тот же слой, что на первом
 * экране, только отражённый по вертикали: те же два градиента под масками,
 * тот же анимированный amplitude (0 → 14.9 → 20 по тем же кривым, проверено
 * по моушен-данным узлов 1100:3045 и 1100:3048) и та же сетка точек. Поэтому
 * фон не рисуется заново, а переиспользуется с flipY.
 *
 * Под канвасом лежит статичный градиент: он виден на телефонах и там, где
 * WebGL недоступен, — секция не должна оставаться белой.
 *
 * intensity поднимает синеву только здесь: первый экран остаётся ровно как
 * в макете. Крутится одним числом.
 */

const LEGAL = [
  'Пользовательское соглашение',
  'Политика конфиденциальности',
  'Условия оплаты',
  'Политика возврата',
  'Правила общения',
];

const LINKS = [
  { label: 'Канал — @zvezdacch', href: 'https://t.me/zvezdacch' },
  { label: 'Бот — @kupits_zvezdyy_bot', href: 'https://t.me/kupits_zvezdyy_bot' },
];

const LEAD =
  'Сервис для быстрой покупки Telegram Stars, Premium и подарков. ' +
  'Удобная оплата, мультиотправка и всё нужное — в одном месте';

export default function Footer() {
  const rootRef = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  // Тяжёлый шейдер на телефонах не крутим — там остаётся статичный градиент.
  const light = useLightMotion();

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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  const on = shown ? ' is-in' : '';

  return (
    <footer className="footer" ref={rootRef}>
      {!light && <Background flipY holes={false} intensity={2.6} className="footer-bg" />}

      <div className="footer-in">
        <img className={`footer-logo${on}`} src="./img/footer/logo.svg" alt="Звездач" width={132} height={132} />

        <div className="footer-lead">
          {/* Текст залит градиентом «белый снизу → прозрачный вверх»
              (bg-clip-text в макете): верхние строки растворяются в фоне. */}
          <p className={`footer-lead-text${on}`}>{LEAD}</p>
          <p className={`footer-lead-note${on}`}>( все это в звездаче )</p>
        </div>

        <div className="footer-legal">
          <h2>Legal</h2>
          <ul>
            {LEGAL.map((item) => (
              <li key={item}><a href="#">{item}</a></li>
            ))}
          </ul>
        </div>

        <div className="footer-social">
          <h2>Боты и соцсети</h2>
          <ul>
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer noopener">
                  <span>{l.label}</span>
                  <img src="./img/footer/arrow.svg" alt="" width={6} height={6} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-by">
          <p className="footer-by-row">
            <span>powered by</span>
            <img src="./img/footer/maljoy.svg" alt="maljoy" width={65} height={29} />
          </p>
          <p className="footer-by-copy">©2026 Звездач. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}
