import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Background from './Background';
import Skeleton from './Skeleton';
import Steps from './Steps';
import Why from './Why';
import Percent from './Percent';
import PercentStraps from './PercentStraps';
import Faq from './Faq';
import Footer from './Footer';
import { avatarHue, isValidUsername, resolveRecipient, type Recipient } from './telegram';
import { DESKTOP_MIN, useLightMotion } from './viewport';
import { HAS_STRAPS } from './variant';
import { PRICE_PER_STAR } from './calculator-config';


const NAV = [
  { label: 'Покупка', href: '#top' },
  { label: 'Гайд', href: '#how' },
  { label: 'Преимущества', href: '#why' },
  { label: 'Партнерка', href: '#percent' },
  { label: 'FAQ', href: '#faq' },
];

const TABS = [
  { id: 'stars', label: 'Stars', icon: './img/tab-stars.svg' },
  { id: 'premium', label: 'Премиум', icon: './img/tab-premium.svg' },
  { id: 'gifts', label: 'Gifts', icon: './img/tab-gifts.svg' },
  { id: 'subs', label: 'Подписки', icon: './img/tab-subs.svg' },
] as const;

const LANGS = ['ru', 'en'] as const;

type PayId = 'sbp' | 'card' | 'crypto';
const PAYS: { id: PayId; label: string }[] = [
  { id: 'sbp', label: 'СБП' },
  { id: 'card', label: 'Картой' },
  { id: 'crypto', label: 'Криптой' },
];

/** «1 234 567» — разряды пробелами, как в макете. */
const groupDigits = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function formatRub(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const [int, frac] = rounded.toFixed(2).split('.');
  return frac === '00' ? groupDigits(int) : `${groupDigits(int)},${frac}`;
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
if (typeof document !== 'undefined' && params.has('still')) {
  document.documentElement.classList.add('is-still');
}

/**
 * Dev-оверлей для сверки с рендером Figma.
 *   ?ref=ui | ?ref=bg   — наложить эталон
 *   &mode=diff          — difference-блендинг, совпадение = чёрный
 *   &o=0.5              — прозрачность
 *   ?skeleton=1         — оставить скелетон включённым
 *   ?still=<c>          — заморозить шейдер на указанной секунде
 */
function RefOverlay() {
  const ref = params.get('ref');
  if (!ref) return null;
  const diff = params.get('mode') === 'diff';
  return (
    <img
      src={ref === 'ui' ? './img/full-ref.png' : './img/bg-ref.png'}
      alt=""
      style={{
        position: 'absolute',
        top: ref === 'ui' ? -56 : 0,
        left: '50%',
        marginLeft: -720,
        width: 1440,
        maxWidth: 'none',
        zIndex: 99,
        pointerEvents: 'none',
        opacity: Number(params.get('o') ?? (diff ? 1 : 0.5)),
        mixBlendMode: diff ? 'difference' : 'normal',
      }}
    />
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('stars');
  const [username, setUsername] = useState('');
  const [multi, setMulti] = useState(false);
  const [amount, setAmount] = useState(() => (params.get('stars') ?? '').replace(/\D/g, ''));
  const [pay, setPay] = useState<PayId>(() => {
    const method = params.get('pay');
    return method === 'card' || method === 'crypto' ? method : 'sbp';
  });
  const [lang, setLang] = useState<(typeof LANGS)[number]>('ru');
  const [langOpen, setLangOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // На телефонах шейдерный фон не крутим: это самый дорогой эффект страницы.
  // Вместо него включается тот же запасной градиент, что и при отсутствии WebGL.
  const light = useLightMotion();

  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'checking' | 'missing'>('idle');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // подтверждённый получатель показывается чипом вместо поля (макет 511:470)
  const asChip = recipient !== null && !editing;

  const langRef = useRef<HTMLDivElement>(null);
  const stars = Number(amount.replace(/\D/g, '')) || 0;
  const total = useMemo(() => stars * PRICE_PER_STAR, [stars]);
  const payIndex = PAYS.findIndex((p) => p.id === pay);

  useEffect(() => {
    if (params.get('skeleton') === '1') return;
    // Ждём и таймер, и шрифты: пока не подгрузились Inter/JetBrains Mono,
    // метрики текста другие и после подмены контента карточка дёргалась бы.
    let alive = true;
    const wait = Promise.all([
      new Promise((r) => setTimeout(r, 900)),
      document.fonts?.ready ?? Promise.resolve(),
    ]);
    wait.then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // подтверждение получателя: дебаунс 400мс, гонки гасим AbortController
  useEffect(() => {
    if (multi) { setRecipient(null); setLookup('idle'); return; }
    const name = username.trim();
    if (!isValidUsername(name)) { setRecipient(null); setLookup('idle'); return; }

    const ac = new AbortController();
    setLookup('checking');
    const t = setTimeout(async () => {
      try {
        const r = await resolveRecipient(name, ac.signal);
        if (ac.signal.aborted) return;
        setRecipient(r);
        setLookup(r ? 'idle' : 'missing');
        // как только получатель найден — поле сворачивается в чип
        if (r) { setEditing(false); inputRef.current?.blur(); }
      } catch {
        if (!ac.signal.aborted) { setRecipient(null); setLookup('idle'); }
      }
    }, 400);

    return () => { ac.abort(); clearTimeout(t); };
  }, [username, multi]);

  useEffect(() => {
    if (!langOpen) return;
    const close = (e: MouseEvent) => {
      if (!langRef.current?.contains(e.target as Node)) setLangOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setLangOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [langOpen]);

  // Макет нарисован под 1440. На более узких десктопах не ломаем раскладку,
  // а ужимаем её целиком: zoom меняет и layout, поэтому высоты и вся
  // скролл-математика пересчитываются сами. Шире 1440 держим 1:1.
  //
  // Считаем не от innerWidth, а от ширины окна «как при 100% зума»: иначе
  // масштабирование в браузере полностью съедалось — при Ctrl+«+» innerWidth
  // уменьшается, мы ужимали вёрстку ровно на столько же, и картинка не менялась.
  //
  // Уровень зума берём из outerWidth: он живёт на уровне окна браузера и на
  // зум страницы не реагирует, поэтому outerWidth/innerWidth и есть текущий
  // зум. Если outerWidth недоступен (0 в некоторых встроенных вьюверах) —
  // откатываемся на devicePixelRatio относительно стартового.
  //
  // Ниже DESKTOP_MIN зум выключается совсем: там работает адаптив, а zoom
  // ужал бы и его — медиазапросы считают реальную ширину вьюпорта и о зуме
  // на #root ничего не знают.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const dpr0 = window.devicePixelRatio || 1;
    const fit = () => {
      const zoomLevel = window.outerWidth > 0
        ? window.outerWidth / window.innerWidth
        : (window.devicePixelRatio || 1) / dpr0;
      const widthAt100 = window.innerWidth * zoomLevel;
      if (widthAt100 < DESKTOP_MIN) { root.style.zoom = ''; return; }
      const z = Math.min(1, widthAt100 / 1440);
      // z==0 случался, когда innerWidth приходил нулевым во встроенном
      // вьювере: страница схлопывалась в пустой экран. Пустой zoom безопаснее.
      root.style.zoom = z >= 0.999 || !(z > 0) ? '' : String(z);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!light) return;
    document.documentElement.classList.add('no-webgl');
    return () => document.documentElement.classList.remove('no-webgl');
  }, [light]);

  const submit = () => {
    if (!username.trim()) return setError('Укажите юзернейм в телеграме');
    if (stars <= 0) return setError('Введите сумму Stars');
    setError(null);
  };

  return (
    <>
    <div className="page" id="top">
      {!light && <Background />}

      {/* Выступ карточки за стикером (Union 492:472): тот же #f2f4f5, что и
          карточка, но под маской купола — поэтому полупрозрачный. */}
      <img className="card-notch" src="./img/bg-union.svg" alt="" aria-hidden="true" />

      <RefOverlay />

      {/* ── шапка ─────────────────────────────────────────────────────── */}
      <header className="topbar">
        <a className="logo" href="#" aria-label="Звезда — на главную">
          <img src="./img/logo.svg" alt="" width={50} height={50} />
        </a>

        <nav className="nav" aria-label="Основная навигация">
          {NAV.map((item, i) => (
            <a className="nav-pill" href={item.href} key={item.label} aria-current={i === 0 ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="lang" ref={langRef}>
            <button
              type="button"
              className={`lang-btn${langOpen ? ' is-open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              onClick={() => setLangOpen((v) => !v)}
            >
              <span className="lang-main">
                <span className="lang-globe">
                  <img src="./img/globe.svg" alt="" width={16} height={16} />
                </span>
                <span className="lang-code">{lang}</span>
              </span>
            </button>

            <div className={`lang-menu${langOpen ? ' is-open' : ''}`} role="listbox">
              {LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={lang === code}
                  className={`lang-option${lang === code ? ' is-active' : ''}`}
                  onClick={() => { setLang(code); setLangOpen(false); }}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <a className="account" href="#">Личный кабинет</a>
        </div>
      </header>

      {/* ── боковые вкладки ───────────────────────────────────────────── */}
      <div className="tabs" role="tablist" aria-label="Что покупаем">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">
              <img src={t.icon} alt="" width={16} height={16} />
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── карточка ──────────────────────────────────────────────────── */}
      <main className={`card${loading ? ' is-loading' : ''}`}>
        {loading ? (
          <Skeleton />
        ) : (
          <>
            <div className="card-head">
              <div className="card-head-text">
                <h1 className="card-title">Купить звезды</h1>
                {/* «и» не висит в конце строки — перенос ровно как в макете */}
                <p className="card-sub">{'Покупайте Telegram Stars быстро и без лишних действий'}</p>
              </div>

              <button
                type="button"
                className="hint"
                aria-label="Как это работает"
                onMouseEnter={() => setTip(true)}
                onMouseLeave={() => setTip(false)}
                onFocus={() => setTip(true)}
                onBlur={() => setTip(false)}
              >
                <img src="./img/help-badge.svg" alt="" width={15.999} height={18.03} />
                <span className={`hint-bubble${tip ? ' is-open' : ''}`} role="tooltip">
                  Звезды придут на аккаунт в течение минуты после оплаты
                </span>
              </button>
            </div>

            <div className="form">
              <div className={`field-group${multi ? ' is-multi' : ''}`}>
                {/* не label: внутри может быть кнопка-чип, поэтому фокус
                    на поле переводим руками */}
                <div
                  className="input-row"
                  onClick={(e) => {
                    if (asChip || (e.target as HTMLElement).closest('button')) return;
                    inputRef.current?.focus();
                  }}
                >
                  <span className="input-icon">
                    <img src="./img/at.svg" alt="" width={16} height={16} />
                  </span>

                  {asChip ? (
                    <button
                      type="button"
                      className="user-chip"
                      aria-label={`Получатель @${recipient.username}. Изменить`}
                      onClick={() => {
                        setEditing(true);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                    >
                      {recipient.avatar ? (
                        <img className="user-chip-ava" src={recipient.avatar} alt="" width={20} height={20} />
                      ) : (
                        <span
                          className="user-chip-ava user-chip-ava--stub"
                          style={{ '--hue': avatarHue(recipient.username) } as CSSProperties}
                        >
                          {recipient.initials}
                        </span>
                      )}
                      <span className="user-chip-name">{recipient.username}</span>
                    </button>
                  ) : (
                    <input
                      ref={inputRef}
                      className="input"
                      type="text"
                      value={username}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={multi ? 'Юзернеймы через запятую' : 'Ваш юзернейм в телеграме'}
                      onChange={(e) => {
                        setUsername(e.target.value.replace(/^@+/, ''));
                        setEditing(true);
                        setError(null);
                      }}
                      onBlur={() => setEditing(false)}
                    />
                  )}

                  {lookup === 'checking' && <span className="spinner" aria-hidden="true" />}
                </div>

                {/* «не найден» — единственное состояние, которого нет в макете:
                    появляется только при неудачном поиске и ничего не сдвигает,
                    пока его нет */}
                <div className={`lookup-miss${lookup === 'missing' ? ' is-open' : ''}`}>
                  <span>Такой юзернейм не найден в телеграме</span>
                </div>

                <div className="multi-row">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={multi}
                    className={`switch${multi ? ' is-on' : ''}`}
                    onClick={() => setMulti((v) => !v)}
                  >
                    <span className="switch-knob" />
                  </button>
                  <div className="multi-text">
                    <span className="multi-title">Мультиотправка</span>
                    <span className="multi-desc">
                      Если вам нужно отправить звезды нескольким юзерам, то включите эту функцию
                    </span>
                  </div>
                </div>
              </div>

              <div className="pay-block">
                <label className="amount-row">
                  <span className="amount-left">
                    <span className="input-icon">
                      <img src="./img/star-input.svg" alt="" width={16} height={16} />
                    </span>
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      placeholder="Введите сумму Stars"
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                        setAmount(digits ? groupDigits(digits) : '');
                        setError(null);
                      }}
                    />
                  </span>
                  <span className="amount-total">~ {formatRub(total)}₽</span>
                </label>

                <div className="segments" role="radiogroup" aria-label="Способ оплаты">
                  <span
                    className="segments-pill"
                    style={{ '--i': payIndex } as CSSProperties}
                    aria-hidden="true"
                  />
                  {PAYS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={pay === p.id}
                      className={`segment${pay === p.id ? ' is-active' : ''}`}
                      onClick={() => setPay(p.id)}
                    >
                      {p.id === 'sbp' && (
                        <span className="seg-icon">
                          <img src="./img/pay-sbp.svg" alt="" width={16} height={16} />
                        </span>
                      )}
                      {p.id === 'card' && (
                        <span className="seg-icon seg-icon--card">
                          <img src="./img/pay-card.svg" alt="" width={15.667} height={15.667} />
                        </span>
                      )}
                      {p.id === 'crypto' && (
                        <span className="seg-stack">
                          <img className="seg-stack-a" src="./img/crypto-1.svg" alt="" />
                          <img className="seg-stack-b" src="./img/crypto-2.svg" alt="" />
                          <img className="seg-stack-c" src="./img/crypto-3.svg" alt="" />
                        </span>
                      )}
                      <span className="seg-label">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="cta">
              <button type="button" className="pay-btn" onClick={submit}>
                <span className="pay-btn-wave" aria-hidden="true" />
                <span className="pay-btn-label">оплатить ЗВЕЗДЫ</span>
              </button>
              <p className={`note${error ? ' is-error' : ''}`}>
                {error ? (
                  error
                ) : (
                  <>
                    <span>{formatRub(PRICE_PER_STAR)} ₽ за звезду</span>
                    <img className="note-dot" src="./img/sep-dot.svg" alt="" width={4} height={4} />
                    <span>Дешевле чем в телеграм</span>
                  </>
                )}
              </p>
            </div>
          </>
        )}

        {/* Стикер по центру верхнего края карточки (node 486:3771).
            Собран из слоёв, а не из растра: PNG-экспорт из Figma приходит
            с запечённым непрозрачным фоном карточки и поверх синего выглядит
            светлым прямоугольником. */}
        <div className="badge" aria-hidden="true">
          <div className="badge-fill">
            <img src="./img/star-fill.svg" alt="" />
          </div>
          <img className="badge-hl1" src="./img/star-hl1.svg" alt="" />
          <img className="badge-hl2" src="./img/star-hl2.svg" alt="" />
        </div>
      </main>
    </div>

    <Steps />
    <Why />
    {HAS_STRAPS ? <PercentStraps /> : <Percent />}
    <Faq />
    <Footer />
    </>
  );
}
