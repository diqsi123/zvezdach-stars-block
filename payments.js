/** Wise-style carousel: the next card moves over the fading current card. */
export function mountPaymentCarousel(section) {
  const viewport = section.querySelector('.payments__viewport');
  const cards = [...section.querySelectorAll('.payment-card')];
  const previous = section.querySelector('.payments__arrow--previous');
  const next = section.querySelector('.payments__arrow--next');
  const status = section.querySelector('.payments__status');
  const controller = new AbortController();
  const {signal} = controller;
  let index = 0;
  let step = 400;
  let drag = null;
  let suppressClick = false;
  let instantFrame;

  function paint(offset = 0) {
    cards.forEach((card, i) => {
      const past = i < index;
      const x = Math.max(0, (i - index) * step) + (past ? 0 : offset);
      card.style.setProperty('--card-x', `${x}px`);
      card.style.setProperty('--card-opacity', past ? '0' : '1');
      const visible = !past && x < viewport.clientWidth - 148;
      card.inert = !visible;
      card.setAttribute('aria-hidden', String(!visible));
    });
    previous.disabled = index === 0;
    next.disabled = index === cards.length - 1;
    section.dataset.index = String(index);
  }

  function goTo(value, {instant = false} = {}) {
    const target = Math.max(0, Math.min(cards.length - 1, value));
    if (instant) section.dataset.instant = 'true';
    index = target;
    paint();
    status.textContent = `Карточка ${index + 1} из ${cards.length}: ${cards[index].querySelector('h2').textContent}`;
    if (instant) {
      cancelAnimationFrame(instantFrame);
      instantFrame = requestAnimationFrame(() => { delete section.dataset.instant; });
    }
  }

  function resize() {
    const width = cards[0].getBoundingClientRect().width;
    step = width + parseFloat(getComputedStyle(section).getPropertyValue('--payment-card-gap'));
    section.style.setProperty('--art-scale', String(width / 384));
    section.dataset.draggable = 'true';
    section.dataset.instant = 'true';
    paint();
    cancelAnimationFrame(instantFrame);
    instantFrame = requestAnimationFrame(() => { delete section.dataset.instant; });
  }

  previous.addEventListener('click', () => goTo(index - 1), {signal});
  next.addEventListener('click', () => goTo(index + 1), {signal});
  viewport.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const destinations = {ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: cards.length - 1};
    if (!(event.key in destinations)) return;
    event.preventDefault();
    goTo(destinations[event.key], {instant: true});
  }, {signal});

  viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('a,button')) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), active: false, cancelled: false, dx: 0};
  }, {signal});
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || drag.cancelled) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag.cancelled = true; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.active = true;
      section.dataset.dragging = 'true';
      viewport.setPointerCapture(event.pointerId);
    }
    drag.dx = dx;
    const beyondEnd = (index === 0 && dx > 0) || (index === cards.length - 1 && dx < 0);
    paint(beyondEnd ? dx * .18 : dx);
  }, {signal});

  function release(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag;
    drag = null;
    delete section.dataset.dragging;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (!current.active) return;
    suppressClick = true;
    const velocity = Math.abs(current.dx) / Math.max(1, performance.now() - current.time);
    const shouldAdvance = event.type !== 'pointercancel' && (Math.abs(current.dx) > step * .16 || velocity > .35);
    goTo(index + (shouldAdvance ? (current.dx < 0 ? 1 : -1) : 0));
    setTimeout(() => { suppressClick = false; }, 0);
  }
  viewport.addEventListener('pointerup', release, {signal});
  viewport.addEventListener('pointercancel', release, {signal});
  viewport.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
  }, {capture: true, signal});
  viewport.addEventListener('dragstart', event => event.preventDefault(), {signal});
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();
  section.dataset.ready = 'true';
  return {goTo, get index() { return index; }, dispose() { controller.abort(); observer.disconnect(); cancelAnimationFrame(instantFrame); }};
}

const section = document.querySelector('.payments');
if (section) {
  mountPaymentCarousel(section);
}
