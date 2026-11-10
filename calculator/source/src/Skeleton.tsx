/**
 * Скелетон карточки на время загрузки.
 *
 * Высоты заглушек равны высотам реальных текстовых боксов (18px для Inter 12/1.5,
 * 16px для JetBrains Mono 12, 36px для двухстрочного описания), поэтому суммарная
 * высота карточки совпадает с загруженной и при подмене контента ничего не прыгает.
 */
const line = (w: number | string, h = 18) => ({ width: w, height: h });

export default function Skeleton() {
  return (
    <>
      <div className="card-head" aria-hidden="true">
        <div className="card-head-text">
          <span className="sk sk-title" />
          <span className="sk-sub">
            <span className="sk" style={line(204, 12)} />
            <span className="sk" style={line(141, 12)} />
          </span>
        </div>
      </div>

      <div className="form" aria-hidden="true">
        <div className="field-group">
          <div className="input-row">
            <span className="sk sk-dot" />
            <span className="sk" style={line(168)} />
          </div>
          <div className="multi-row">
            <span className="sk sk-switch" />
            <div className="multi-text">
              <span className="sk" style={line(100, 16)} />
              <span className="sk" style={line('100%', 36)} />
            </div>
          </div>
        </div>

        <div className="pay-block">
          <div className="amount-row">
            <span className="amount-left">
              <span className="sk sk-dot" />
              <span className="sk" style={line(130)} />
            </span>
            <span className="sk" style={line(46)} />
          </div>

          <div className="segments">
            {[30, 46, 46].map((w, i) => (
              <span className="segment" key={i}>
                <span className="sk sk-dot" />
                <span className="sk" style={line(w, 12)} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="cta" aria-hidden="true">
        <span className="sk sk-btn" />
        <span className="sk" style={line(262)} />
      </div>

      <span className="sr-only" role="status">
        Загружаем форму
      </span>
    </>
  );
}
