import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { HAS_CLOUDS } from './variant';

/**
 * FAQ — секция 1002:3689 (1440×587, y=4188).
 *
 * Геометрия из макета: заголовок сверху (бокс 94×59 по центру), колонка
 * вопросов 600 шириной на y=115. Внутри вопроса: строка 24px, при раскрытии
 * ещё 16px отступа и ответ шириной 480; до разделителя 28px и столько же
 * от разделителя до следующего вопроса. Разделитель в макете — вектор
 * нулевой высоты со штрихом 1.5px, то есть места в потоке не занимает;
 * поэтому он ::after, а не border, иначе колонка разъезжалась бы на 1.5px
 * на каждом стыке. У последнего вопроса разделитель нарисован с opacity 0 —
 * его просто нет.
 *
 * В макете раскрыт первый вопрос, поэтому и высота секции посчитана под него.
 * Здесь это обычный аккордеон: высота секции идёт за содержимым.
 */

type Item = { q: string; a: string };

const QUESTIONS: Item[] = [
  {
    q: 'Что такое Звездач?',
    // Неразрывные пробелы после союзов: без них «и»/«или» повисают в конце
    // строки, и перенос расходится с макетом (там ровно эти четыре строки).
    a: 'Звездач — это сервис для покупки Telegram Stars, Premium, Gifts и оплаты подписок на Telegram-сервисы. Покупайте для себя или других пользователей, оплачивайте удобным способом и отслеживайте статус заказа в личном кабинете.',
  },
  {
    // Ответ собран из того, что уже написано на самой странице: шаги покупки,
    // способы оплаты и подсказка про минуту после оплаты.
    q: 'Как купить Telegram Stars?',
    a: 'Выберите Stars на главной, укажите Telegram-юзернейм получателя и количество звезд, затем оплатите заказ через СБП, картой или криптовалютой. Звезды придут на аккаунт в течение минуты после оплаты.',
  },
  {
    q: 'Как купить Telegram Premium?',
    a: 'Переключитесь на вкладку «Премиум» и пройдите те же шаги: юзернейм получателя, параметры заказа и оплата через СБП, картой или криптовалютой.',
  },
  {
    // TODO: текста нет ни в макете, ни на сайте — заменить на реальную
    // политику возврата, прежде чем показывать блок пользователям.
    q: 'Можно ли вернуть оплату?',
    a: 'Здесь будет описание условий возврата.',
  },
  {
    // TODO: контакт поддержки на сайте пока не задан — подставить реальный.
    q: 'Как связаться с поддержкой?',
    a: 'Здесь будет контакт поддержки.',
  },
];

export default function Faq() {
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // В макете раскрыт первый вопрос — с ним и открываем секцию.
  const [open, setOpen] = useState(0);

  /**
   * Резерв под самый длинный ответ: без него высота секции гуляла на сотню
   * пикселей и футер ездил вслед за раскрытым пунктом.
   *
   * Резерв висит на самом абзаце, а не на слоте: слот — грид-элемент с
   * overflow: hidden, и min-height на нём не даёт строке схлопнуться в 0fr.
   * И он стоит на ВСЕХ ответах, а не только на раскрытом: иначе при закрытии
   * снимался бы мгновенно, высота падала скачком, и лишь потом шла анимация.
   * Одинаковая высота слота у всех пунктов заодно значит, что переключение
   * между ними — это ровно два встречных перехода без скачка общей высоты.
   *
   * Замер идёт с временно снятым резервом: он задан той же переменной,
   * которую мы вычисляем, и без обнуления замер читает собственный результат
   * — высота росла на каждом пересчёте (100 → 121 → ...).
   *
   * Значения ставим прямо на элемент, без состояния: это чистая геометрия,
   * перерисовывать ради неё компонент незачем.
   */
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      list.style.setProperty('--faq-answer', '0px');
      list.style.minHeight = '0px';

      const items = [...list.querySelectorAll<HTMLElement>('.faq-item')];
      const paras = [...list.querySelectorAll<HTMLElement>('.faq-a p')];
      if (!items.length || !paras.length) return;

      const tallest = Math.max(...paras.map((el) => el.scrollHeight));
      const gap = items.length > 1 ? parseFloat(getComputedStyle(items[1]).marginTop) || 0 : 0;
      let closed = gap * (items.length - 1);
      for (const item of items) {
        const slot = item.querySelector<HTMLElement>('.faq-a');
        closed += item.offsetHeight - (slot?.offsetHeight ?? 0);
      }

      list.style.setProperty('--faq-answer', `${Math.ceil(tallest)}px`);
      list.style.minHeight = `${Math.ceil(closed + tallest)}px`;
    };

    measure();
    // метрики текста меняются вместе со шрифтами и шириной колонки
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const [titleIn, setTitleIn] = useState(false);
  const [shown, setShown] = useState<boolean[]>(() => QUESTIONS.map(() => false));

  /**
   * Появление держим в состоянии, а не вешаем `is-in` через classList, как в
   * соседних секциях. У вопроса className меняется при раскрытии, и React
   * переписывает атрибут целиком — дописанный мимо него класс затирался бы,
   * от голого `.reveal` оставалась opacity: 0, и вопрос пропадал по клику.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const showAll = () => { setTitleIn(true); setShown(QUESTIONS.map(() => true)); };
    if (!('IntersectionObserver' in window)) { showAll(); return; }

    const io = new IntersectionObserver(
      (entries) => {
        const hit: string[] = [];
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          hit.push((e.target as HTMLElement).dataset.reveal ?? '');
          io.unobserve(e.target);
        }
        if (!hit.length) return;
        if (hit.includes('title')) setTitleIn(true);
        const idx = hit.filter((v) => v !== 'title').map(Number);
        if (idx.length) {
          setShown((prev) => {
            const next = prev.slice();
            for (const i of idx) next[i] = true;
            return next;
          });
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    );
    root.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section className="faq" id="faq" ref={rootRef} aria-labelledby="faq-title">
      {HAS_CLOUDS && (
        <div className="faq-clouds" aria-hidden="true">
          <img src="./img/faq/clouds-t.svg" alt="" />
        </div>
      )}

      <h2 className={`faq-title reveal${titleIn ? ' is-in' : ''}`} id="faq-title" data-reveal="title">faq</h2>

      <div className="faq-list" ref={listRef}>
        {QUESTIONS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              className={`faq-item reveal${shown[i] ? ' is-in' : ''}${isOpen ? ' is-open' : ''}`}
              key={item.q}
              data-reveal={i}
              style={{ '--d': `${80 + i * 70}ms` } as CSSProperties}
            >
              <button
                type="button"
                className="faq-q"
                id={`faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span className="faq-q-text">{item.q}</span>
                <span className="faq-chev">
                  <img src="./img/faq/chevron.svg" alt="" width={24} height={24} />
                </span>
              </button>

              {/* Раскрытие — сеткой 0fr → 1fr: высота ответа считается браузером,
                  мерить её руками и держать в состоянии не нужно. */}
              <div className="faq-a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>
                <div className="faq-a-in">
                  <p>{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
