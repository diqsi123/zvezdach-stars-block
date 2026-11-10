import { useEffect, useRef } from 'react';
import { DOTS_ALPHA, DOTS_COLS, DOTS_GRID, DOTS_ROWS } from './dots-data';

/**
 * Фон из Figma (node 962:1931) — градиент под радиальной маской.
 *
 * В макете это прямоугольник 1584×1798 с линейным градиентом #05A2EB → #19C2FF
 * под 49.317°, повёрнутый на -90° и отражённый по Y, поверх — радиальная маска
 * и шейдер Warp с заанимированным параметром amplitude (0 → 14.9 → 20 по
 * кривым Безье, ~8.17 c). Здесь геометрия слоя посчитана напрямую, а не
 * подогнана по рендеру: обратное преобразование в систему координат
 * прямоугольника, проекция на градиентную линию и спад маски по стопам из
 * экспортированного SVG. Цикл бесшовный (ping-pong, ~16.3 c).
 *
 * Сверху — слой «dots» (node 962:1937): сетка 56×56, шаг 36.12px, радиус
 * 1.204px, прозрачность каждой точки взята один-в-один из экспортированного
 * SVG. Точки едва заметно реагируют на курсор.
 */

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;

out vec4 outColor;

uniform vec2  uRes;      // размер канваса в CSS-пикселях
uniform float uDpr;
uniform float uTime;     // секунды
uniform float uAmp;      // 0..1 — нормализованная amplitude из Figma-таймлайна
uniform vec2  uMouse;    // сглаженная позиция курсора, страничные px
uniform float uMouseOn;  // 0..1 — курсор над страницей
uniform float uIntensity; // 1.0 — ровно как на первом экране
uniform vec2  uDotsOrigin;
uniform sampler2D uDots; // 56×56, R = прозрачность точки
uniform vec4  uHoles[4]; // прямоугольники, под которыми точек быть не должно
uniform int   uHoleCount;

const vec3  BG   = vec3(242.0, 244.0, 245.0) / 255.0;
const vec3  BLUE = vec3(  5.0, 162.0, 235.0) / 255.0;  // #05A2EB
const vec3  CYAN = vec3( 25.0, 194.0, 255.0) / 255.0;  // #19C2FF
// Куда уходит цвет, когда просят «глубже»: тот же тон, но плотнее.
const vec3  DEEP = vec3(  0.0, 132.0, 214.0) / 255.0;  // #0084D6

const float DOT_STEP = 36.12;
const float DOT_R    = 1.204;
const float DOT_ORG  = 1.204;

// Реакция на курсор намеренно едва заметная: точки чуть подрастают и слегка
// светлеют, смещение — единицы пикселей. Не самостоятельный интерактив, а отклик.
const float MOUSE_RADIUS = 165.0;
const float MOUSE_PUSH   = 3.5;
const float MOUSE_GROW   = 0.42;
const float MOUSE_LIFT   = 1.10;

// --- фон из макета 962:1931 --------------------------------------------------
// Не подгонка по рендеру, а прямая геометрия слоя. В Figma это прямоугольник
// 1584×1798 с линейным градиентом под 49.317°, повёрнутый на -90° и отражённый
// по Y, поверх него радиальная маска. Ниже — тот же расчёт в системе координат
// макета (1440 по ширине, 0 — верх страницы).

// Левый верхний угол слоя в координатах страницы (обёртка right:-179, top:-822).
// Проверено по референс-рендеру: центр маски ложится в (650.5, -107.7),
// подгонка по эталону даёт (655.6, -106.7) — расхождение 5px.
const vec2  L_ORIGIN = vec2(-179.0, -822.0);
// Центр бокса — от него отмеряется градиентная линия.
const vec2  L_CENTER = vec2(792.0, 899.0);
// Направление градиента 49.317° и длина градиентной линии для этого бокса.
const vec2  G_DIR = vec2(0.758343, -0.651857);
const float G_LEN = 2373.25;
const float G_A = 0.24914;   // стоп #05A2EB
const float G_B = 0.57609;   // стоп #19C2FF
// Маска: слой 1798×1332 со сдвигом (0,124), радиальный градиент с центром
// (829.464, 590.271) и полуосями 1460.61 × 569.729 после поворота на 90°.
const vec2  M_OFFSET = vec2(0.0, 124.0);
const vec2  M_CENTER = vec2(829.464, 590.271);
const vec2  M_RADIUS = vec2(1460.61, 569.729);

// Насколько фон «синит». 1.0 = ровно как в макете 962:1931.
// Раньше здесь стояло 0.80 — сознательный отход по просьбе «чуть меньше синевы».
// Вернул к макету вместе с переделкой фона; крутится одним числом.
const float BLUE_STRENGTH = 1.0;

// Спад радиальной маски — стопы взяты из экспортированного SVG как есть.
const float MK_R[16] = float[16](
  0.0, 0.117896, 0.213837, 0.2912, 0.353363, 0.403704, 0.4456, 0.48243,
  0.51757, 0.5544, 0.596296, 0.646637, 0.7088, 0.786163, 0.882104, 1.0);
const float MK_A[16] = float[16](
  1.0, 0.991615, 0.967585, 0.9296, 0.879348, 0.818519, 0.7488, 0.671881,
  0.589452, 0.5032, 0.414815, 0.325985, 0.2384, 0.153748, 0.0737185, 0.0);

// --- мягкий шум для органичного дрейфа --------------------------------------
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Мягкий вырез: точки гаснут под логотипом, меню и кнопками справа.
float holeFade(vec2 q) {
  float f = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uHoleCount) break;
    vec4 r = uHoles[i];
    vec2 c = r.xy + r.zw * 0.5;
    vec2 h = r.zw * 0.5 + 8.0;
    vec2 d = abs(q - c) - h;
    float sd = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
    f = min(f, smoothstep(0.0, 16.0, sd));
  }
  return f;
}

// Спад маски по нормированному радиусу: кусочно-линейно по стопам SVG.
float maskAlpha(float rho) {
  if (rho >= 1.0) return 0.0;
  for (int i = 0; i < 15; i++) {
    if (rho <= MK_R[i + 1]) {
      float f = (rho - MK_R[i]) / (MK_R[i + 1] - MK_R[i]);
      return mix(MK_A[i], MK_A[i + 1], f);
    }
  }
  return 0.0;
}

void main() {
  vec2 q = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr; // страничные px
  vec2 d = vec2(q.x - (uRes.x - 1440.0) * 0.5, q.y);                    // координаты макета

  // --- warp: медленный домен-дрейф, амплитуда идёт по таймлайну Figma ---
  float amp = uAmp;
  float t1 = uTime * 0.19;
  float t2 = uTime * 0.13;
  vec2 w = vec2(
    sin(d.y * 0.0052 + t1 * 2.1) * 1.00 + sin(d.x * 0.0031 - t2 * 1.7) * 0.62,
    sin(d.x * 0.0044 - t1 * 1.6) * 1.00 + sin(d.y * 0.0027 + t2 * 2.3) * 0.55
  );
  w += (vec2(vnoise(d * 0.0016 + t2 * 0.35), vnoise(d * 0.0016 + 7.3 - t1 * 0.28)) - 0.5) * 1.1;
  vec2 p = d + w * amp * 24.0;

  // --- градиент под маской -------------------------------------------------
  vec2 l = p - L_ORIGIN;

  // Положение вдоль градиентной линии -> доля между стопами макета.
  float proj = dot(l - L_CENTER, G_DIR) / G_LEN + 0.5;
  float t = clamp((proj - G_A) / (G_B - G_A), 0.0, 1.0);

  // Маска дышит и медленно плывёт — иначе анимация не читалась бы: основная
  // часть градиента в макете закрыта карточкой.
  float breath = 1.0 + 0.135 * sin(uTime * 0.68) + 0.05 * sin(uTime * 1.21 + 1.7);
  vec2 drift = vec2(115.0 * sin(uTime * 0.44), 44.0 * sin(uTime * 0.59 + 0.9));

  vec2 m = l - M_OFFSET - M_CENTER - drift;
  float rho = length(m / (M_RADIUS * breath));
  float a = maskAlpha(rho) * BLUE_STRENGTH;

  // Интенсивность тянет две вещи разом. Охват: 1-(1-a)^k растягивает спад
  // маски наружу, синий забирает больше кадра, но края остаются мягкими.
  // Глубина: цвет подмешивается к более плотному синему.
  a = clamp(1.0 - pow(1.0 - a, uIntensity), 0.0, 1.0);
  vec3 tint = mix(BLUE, CYAN, t);
  tint = mix(tint, DEEP, clamp((uIntensity - 1.0) * 0.32, 0.0, 1.0));

  vec3 col = mix(BG, tint, a);

  // --- точки ---------------------------------------------------------------
  // Вне зоны курсора точка не смещается, поэтому достаточно одной — ближайшей —
  // ячейки сетки. Полный обход 3×3 включается только рядом с курсором.
  vec2 dl = q - uDotsOrigin;
  vec2 gi = floor((dl - DOT_ORG) / DOT_STEP + 0.5);
  float aa = 0.5 / uDpr + 0.35;
  float cover = 0.0;
  const vec2 GRID = vec2(${DOTS_COLS}.0, ${DOTS_ROWS}.0);

  // Сетка бесконечная: индекс заворачивается по модулю 56, поэтому рисунок
  // макета продолжается на любой ширине окна, а внутри исходной области
  // остаётся тем же.
  if (uMouseOn < 0.01 || length(q - uMouse) > MOUSE_RADIUS + MOUSE_PUSH + 8.0) {
    vec2 c = uDotsOrigin + vec2(DOT_ORG) + gi * DOT_STEP;
    cover = (1.0 - smoothstep(DOT_R - aa, DOT_R + aa, length(q - c)))
          * texture(uDots, (mod(gi, GRID) + 0.5) / GRID).r;
  } else {
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 idx = gi + vec2(float(ox), float(oy));
        vec2 c = uDotsOrigin + vec2(DOT_ORG) + idx * DOT_STEP;
        if (length(q - c) > MOUSE_PUSH + DOT_R * (1.0 + MOUSE_GROW) + aa + 1.0) continue;

        float a0 = texture(uDots, (mod(idx, GRID) + 0.5) / GRID).r;
        if (a0 <= 0.001) continue;

        vec2 away = c - uMouse;
        float infl = smoothstep(MOUSE_RADIUS, 0.0, length(away));
        infl = infl * infl * (3.0 - 2.0 * infl) * uMouseOn;

        vec2 pos = c + normalize(away + vec2(1e-4)) * infl * MOUSE_PUSH;
        float r = DOT_R * (1.0 + infl * MOUSE_GROW);
        cover = max(cover, (1.0 - smoothstep(r - aa, r + aa, length(q - pos)))
                         * min(1.0, a0 * (1.0 + infl * MOUSE_LIFT)));
      }
    }
  }

  col = mix(col, vec3(1.0), cover * holeFade(q));
  outColor = vec4(col, 1.0);
}
`;

/* ---- таймлайн amplitude из get_motion_context (node 486:3848) ------------- */
type Key = { t: number; v: number; ease: [number, number, number, number] };
const KEYS: Key[] = [
  { t: 0, v: 0, ease: [0.5, 0, 0.5, 1] },
  { t: 2.69055, v: 14.9, ease: [0.42, 0, 0.58, 1] },
  { t: 5.406799, v: 20, ease: [0.5, 0, 0.5, 1] },
  { t: 8.169879, v: 20, ease: [0.42, 0, 0.58, 1] },
];
const LOOP = KEYS[KEYS.length - 1].t;

function bezier(x1: number, y1: number, x2: number, y2: number, x: number) {
  // Ньютон по компоненте X кубической кривой Безье, затем берём Y.
  let u = x;
  for (let i = 0; i < 6; i++) {
    const iu = 1 - u;
    const cx = 3 * iu * iu * u * x1 + 3 * iu * u * u * x2 + u * u * u;
    const dx = 3 * iu * iu * x1 + 6 * iu * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    u -= (cx - x) / dx;
    u = Math.min(1, Math.max(0, u));
  }
  const iu = 1 - u;
  return 3 * iu * iu * u * y1 + 3 * iu * u * u * y2 + u * u * u;
}

/** Нормализованная (0..1) amplitude, ping-pong — чтобы петля была бесшовной. */
function amplitudeAt(time: number) {
  const pp = time % (LOOP * 2);
  const s = pp <= LOOP ? pp : LOOP * 2 - pp;
  let v = KEYS[KEYS.length - 1].v;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (s <= b.t) {
      const e = bezier(a.ease[0], a.ease[1], a.ease[2], a.ease[3], (s - a.t) / (b.t - a.t));
      v = a.v + (b.v - a.v) * e;
      break;
    }
  }
  return v / 20;
}

function makeDotTexture(gl: WebGL2RenderingContext) {
  const data = new Uint8Array(DOTS_COLS * DOTS_ROWS);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(DOTS_ALPHA[DOTS_GRID[i]] * 255);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, DOTS_COLS, DOTS_ROWS, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile error');
  }
  return sh;
}

type Props = {
  /**
   * Отражение по вертикали. В футере (1100:3042) тот же слой стоит с
   * -scale-y-100 на всех трёх подслоях, включая точки, — то есть это
   * буквально фон первого экрана вверх ногами.
   */
  flipY?: boolean;
  /** Вырезы под шапкой. Ищутся по всему документу, поэтому вне героя не нужны. */
  holes?: boolean;
  /** Насыщенность и охват синего. 1 — как на первом экране, больше — плотнее. */
  intensity?: number;
  className?: string;
};

export default function Background({
  flipY = false,
  holes = true,
  intensity = 1,
  className = 'bg-canvas',
}: Props = {}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const stillParam = new URLSearchParams(location.search).get('still');
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
      // в режиме сверки буфер нужен для чтения пикселей
      preserveDrawingBuffer: stillParam !== null,
    });
    if (!gl) {
      canvas.style.display = 'none';
      document.documentElement.classList.add('no-webgl');
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    }
    gl.useProgram(prog);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, makeDotTexture(gl));

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes'), uDpr = u('uDpr'), uTime = u('uTime'), uAmp = u('uAmp');
    const uMouse = u('uMouse'), uMouseOn = u('uMouseOn'), uDotsOrigin = u('uDotsOrigin');
    const uHoles = u('uHoles'), uHoleCount = u('uHoleCount');
    gl.uniform1i(u('uDots'), 0);
    gl.uniform1f(u('uIntensity'), intensity);

    /** Под шапкой точек быть не должно — собираем прямоугольники из DOM. */
    const pushHoles = () => {
      if (!holes) { gl.uniform1i(uHoleCount, 0); return; }
      const rect = canvas.getBoundingClientRect();
      const sel = ['.logo', '.nav', '.topbar-right'];
      const data: number[] = [];
      let n = 0;
      for (const s of sel) {
        const el = document.querySelector(s);
        if (!el || n >= 4) continue;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        data.push(b.left - rect.left, b.top - rect.top, b.width, b.height);
        n++;
      }
      while (data.length < 16) data.push(0, 0, 0, 0);
      gl.uniform4fv(uHoles, new Float32Array(data));
      gl.uniform1i(uHoleCount, n);
    };

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      // до первой раскладки клиентский размер может быть нулевым — тогда
      // uRes стал бы (0,0) и весь кадр ушёл бы в NaN; ждём реального размера
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uDpr, dpr);
      // слой dots: 1989×1989, центр в (54.17% + 42.5px, -68.5px) от верха страницы
      gl.uniform2f(uDotsOrigin, w / 2 + 102.55 - 994.5, -68.5 - 994.5);
      pushHoles();
    };
    resize();
    // шапка появляется после первого рендера React — досчитаем вырезы позже
    requestAnimationFrame(() => requestAnimationFrame(pushHoles));

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // курсор: тянем сглаженную точку за реальной, чтобы поле реагировало плавно
    const target = { x: -9999, y: -9999 };
    const smooth = { x: -9999, y: -9999 };
    let on = 0;
    let onTarget = 0;

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = e.clientX - r.left;
      // у перевёрнутого холста курсор надо зеркалить, иначе точки
      // отзываются в противоположной половине кадра
      target.y = flipY ? r.height - (e.clientY - r.top) : e.clientY - r.top;
      if (smooth.x < -9000) { smooth.x = target.x; smooth.y = target.y; }
      onTarget = 1;
    };
    const onLeave = () => { onTarget = 0; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    // dev: ?still=<секунды> рисует один кадр и останавливает цикл (для скриншотов)
    const still = stillParam;
    let raf = 0;
    let clock = still !== null ? Number(still) || 0 : 0;
    let prev = performance.now();

    const frame = (now: number) => {
      if (still === null) raf = requestAnimationFrame(frame);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (!w || !h) return; // размер ещё не известен — рисовать нечего
      if (!reduce.matches && still === null) clock += dt;

      const k = 1 - Math.pow(0.0016, dt); // критично-плавное догоняние
      smooth.x += (target.x - smooth.x) * k;
      smooth.y += (target.y - smooth.y) * k;
      on += (onTarget - on) * (1 - Math.pow(0.02, dt));

      gl.uniform1f(uTime, clock);
      gl.uniform1f(uAmp, amplitudeAt(clock));
      gl.uniform2f(uMouse, smooth.x, smooth.y);
      gl.uniform1f(uMouseOn, on);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (still === null) raf = requestAnimationFrame(frame);
    else frame(performance.now()); // один синхронный кадр — для скриншотов

    if (import.meta.env.DEV) {
      // отладочный хук: нарисовать конкретный момент цикла и сразу прочитать пиксели
      (window as unknown as Record<string, unknown>).__bgDraw = (t: number, mx = -9999, my = -9999) => {
        clock = t;
        gl.uniform1f(uTime, t);
        gl.uniform1f(uAmp, amplitudeAt(t));
        gl.uniform2f(uMouse, mx, my);
        gl.uniform1f(uMouseOn, mx > -9000 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const out = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return { data: out, w: canvas.width, h: canvas.height, dpr };
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [flipY, holes, intensity]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
