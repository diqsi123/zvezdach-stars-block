import { useMemo, useState } from 'react';
import { ShaderEffect } from './lib/custom-effect-runtime';
import type { CustomEffectState } from './lib/custom-effect-runtime/types';
import { setup as sliceSetup, render as sliceRender, manifest as sliceManifest } from './lib/custom-effects/CodeComponentId_7271548919dd969a0c4caae83b087c186a2a366b_426';
import { setup as warpSetup, render as warpRender, manifest as warpManifest } from './lib/custom-effects/CodeComponentId_fdd6f30d1b1fbc1dfd5498281275c43a1fad247c_411';

const ASSETS = './img/calculator/';
// Keyframe positions are supplied by Figma in microseconds.
const TRACK = [
  { t: 0, value: 0, curve: [0.5, 0, 0.5, 1] },
  { t: 2.69055, value: 14.90000057220459, curve: [0.42, 0, 0.58, 1] },
  { t: 5.406799, value: 20, curve: [0.5, 0, 0.5, 1] },
  { t: 8.169879, value: 20, curve: [0.42, 0, 0.58, 1] },
];
function bezier(value: number, [x1, y1, x2, y2]: number[]) {
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    if (sample(mid, x1, x2) < value) low = mid; else high = mid;
  }
  return sample((low + high) / 2, y1, y2);
}
function amplitude(time: number) {
  const duration = TRACK[TRACK.length - 1].t;
  const phase = time % (duration * 2);
  const t = phase <= duration ? phase : duration * 2 - phase;
  for (let i = 1; i < TRACK.length; i++) {
    const a = TRACK[i - 1], b = TRACK[i];
    if (t <= b.t) return a.value + (b.value - a.value) * bezier((t - a.t) / (b.t - a.t), a.curve);
  }
  return 20;
}
function animatedWarp(device: GPUDevice, frame: CustomEffectState) {
  // The supplied runtime clock is in milliseconds, unlike the Figma track.
  // Clamp gaps after a background tab resumes so the sky continues gently.
  const previous = Number(frame.state.previousTime ?? frame.time);
  const delta = Math.max(0, Math.min(frame.time - previous, 50)) / 1000;
  frame.state.previousTime = frame.time;
  frame.state.motionTime = Number(frame.state.motionTime ?? 0) + delta;
  warpRender(device, { ...frame, params: { ...frame.params, amplitude: amplitude(Number(frame.state.motionTime)) } });
}
export default function Sky() {
  const [painted, setPainted] = useState(false);
  const supported = !!navigator.gpu && 'onpaint' in HTMLCanvasElement.prototype;
  const live = supported && !matchMedia('(prefers-reduced-motion: reduce)').matches && !new URLSearchParams(location.search).has('still');
  const shaders = useMemo(() => [
    { setup: sliceSetup, render: sliceRender, params: { softness: 87, shift: 200, transform: { x: 50, y: 50, radius: 66.4038314819336, angle: -55.36711120605469 }, random: 138 }, manifest: sliceManifest },
    { setup: warpSetup, render: (device: GPUDevice, frame: CustomEffectState) => {
      animatedWarp(device, frame);
      if (!frame.state.firstPaint) {
        frame.state.firstPaint = true;
        requestAnimationFrame(() => setPainted(true));
      }
    }, params: { centerPoint: { x: 82, y: 132 }, warpType: 0, amplitude: 11.100000381469727, frequency: 0.6000000238418579 }, manifest: { ...warpManifest, isAnimated: true } },
  ], []);
  return <div className="calculator-sky" data-renderer={live ? 'figma-shader' : 'figma-export'} aria-hidden="true">
    {live && <div className="sky-live">
      <div className="sky-effect-position" style={{ maskImage: `url(${ASSETS}bfa7a.svg)` }}><div className="sky-effect-rotation">
        <ShaderEffect className="sky-effect" shaders={shaders}>
          <div className="sky-effect-input" />
        </ShaderEffect>
      </div></div>
      <img className="sky-cloud" style={{ maskImage: `url(${ASSETS}bfa7a.svg)` }} src={`${ASSETS}eac22.svg`} alt="" />
    </div>}
    <img className={`sky-export${live && painted ? ' is-painted' : ''}`} src={`${ASSETS}sky.png`} alt="" fetchPriority="high" />
  </div>;
}
