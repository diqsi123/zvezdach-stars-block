import { useRef, useState, type FormEvent } from 'react';
import Sky from './Sky';
import AmountInput from './AmountInput';
import { formatNumber, PRICE_PER_STAR, type PaymentMethod } from './calculator-config';
const ASSETS = './img/calculator/';
const PAYMENTS: { id: PaymentMethod; label: string }[] = [{ id: 'sbp', label: 'СБП' }, { id: 'card', label: 'Карта' }, { id: 'crypto', label: 'Крипта' }];

function PaymentIcon({ method }: { method: PaymentMethod }) {
  return method === 'crypto' ? <span className="payment-crypto" aria-hidden="true">
    <img src={`${ASSETS}81076.svg`} alt="" /><img src={`${ASSETS}4f8e0.svg`} alt="" /><img src={`${ASSETS}7dee6.svg`} alt="" />
  </span> : <img className="payment-icon" src={`${ASSETS}${method === 'sbp' ? 'b0d83.svg' : '5e2f9.svg'}`} alt="" />;
}
function ProductBadge() {
  return <div className="product-badge" aria-hidden="true">
    <img className="badge-body" style={{ maskImage: `url(${ASSETS}7770c.svg)` }} src={`${ASSETS}0b29a.svg`} alt="" />
    <img className="badge-shine" src={`${ASSETS}8b6e5.svg`} alt="" /><img className="badge-shadow" src={`${ASSETS}ce946.svg`} alt="" />
  </div>;
}
function cleanValue(raw: string, decimals: number) {
  const normalized = raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const [whole, ...rest] = normalized.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '').slice(0, 9);
  if (!decimals) return integer;
  return rest.length ? `${integer || '0'}.${rest.join('').slice(0, decimals)}` : integer;
}
export default function App() {
  const saved = history.state?.calculator;
  const [stars, setStars] = useState<string>(saved?.stars ?? '');
  const [rubles, setRubles] = useState<string>(saved?.rubles ?? '');
  const [reversed, setReversed] = useState<boolean>(saved?.reversed ?? false);
  const [payment, setPayment] = useState<PaymentMethod>(saved?.payment ?? 'sbp');
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const starsRef = useRef<HTMLInputElement>(null), rublesRef = useRef<HTMLInputElement>(null);
  function updateStars(raw: string) {
    const value = cleanValue(raw, 0);
    setStars(value);
    setRubles(value ? String(Math.round(Number(value) * PRICE_PER_STAR * 100) / 100) : '');
    setError('');
  }
  function updateRubles(raw: string) {
    const value = cleanValue(raw, 2);
    setRubles(value);
    setStars(value ? String(Math.floor(Math.round(Number(value) * 100) / (PRICE_PER_STAR * 100))) : '');
    setError('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!stars || Number(stars) < 50) {
      setError('Минимум 50 звёзд');
      (reversed ? rublesRef : starsRef).current?.focus();
      return;
    }
    const next = new URL(location.href);
    history.replaceState({ ...history.state, calculator: { stars, rubles, reversed, payment } }, '');
    next.search = new URLSearchParams({ checkout: '1', stars, pay: payment }).toString();
    next.hash = '';
    location.assign(next.href);
  }
  return <main className="calculator-page">
    <Sky />
    <form className="calculator-card" onSubmit={submit} noValidate autoComplete="off" aria-labelledby="calculator-title">
      <ProductBadge />
      <header className="calculator-heading">
        <h1 id="calculator-title">Купить<br />Telegram Stars</h1>
        <p>Звёзды Телеграм для себя, друга или нескольких. Оплата СБП, картой или криптой. Заказ автоматический.</p>
        <div className="calculator-help">
          <button type="button" className="help-button" aria-label="О Telegram Stars" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)} onBlur={() => setHelpOpen(false)} onKeyDown={event => { if (event.key === 'Escape') setHelpOpen(false); }}><img src={`${ASSETS}0e177.svg`} alt="" /></button>
          {helpOpen && <div className="help-tooltip" role="tooltip">Укажите количество звёзд или бюджет в рублях — второе поле посчитается автоматически.</div>}
        </div>
      </header>
      <div className="calculator-options">
        <div className={`conversion-fields${reversed ? ' is-reversed' : ''}`}>
          <label className="conversion-field stars-field" data-position={reversed ? 'bottom' : 'top'}>
            <span className="field-label">Количество звезд</span>
            <AmountInput inputRef={starsRef} label="Количество звезд" value={stars} decimals={0} error={error} onChange={updateStars} />
          </label>
          <label className="conversion-field rubles-field" data-position={reversed ? 'top' : 'bottom'}>
            <span className="field-label">Стоимость в рублях</span>
            <div className="field-value-row">
              <AmountInput inputRef={rublesRef} label="Стоимость в рублях" value={rubles} decimals={2} error={error} onChange={updateRubles} />
              <span className="currency-chip"><span className="ruble-icon"><img src={`${ASSETS}c76c2.svg`} alt="" /></span>Рубли</span>
            </div>
          </label>
          <button className="swap-button" type="button" aria-label="Поменять поля местами" aria-pressed={reversed} onClick={() => setReversed(value => !value)}><img className={reversed ? 'is-reversed' : ''} src={`${ASSETS}swap-control.png`} alt="" /></button>
          {error && <span className="amount-error" id="amount-error" role="alert">{error}</span>}
        </div>
        <div className="payment-selector" role="radiogroup" aria-label="Способ оплаты">
          <span className="payment-selection" style={{ transform: `translateX(${PAYMENTS.findIndex(item => item.id === payment) * 100}%)` }} aria-hidden="true" />
          {PAYMENTS.map(item => <label className="payment-segment" key={item.id}>
            <input type="radio" name="payment" value={item.id} checked={payment === item.id} onChange={() => setPayment(item.id)} />
            <PaymentIcon method={item.id} /><span>{item.label}</span>
          </label>)}
        </div>
      </div>
      <footer className="calculator-checkout">
        <button className="checkout-button" type="submit">Оплатить звезды</button>
        <p className="price-summary"><span>{stars && Number(stars) > 0 ? formatNumber(PRICE_PER_STAR) : '—'} ₽ за звезду</span><img src={`${ASSETS}a1c73.svg`} alt="" /><span>Дешевле чем в телеграм</span></p>
      </footer>
    </form>
  </main>;
}
