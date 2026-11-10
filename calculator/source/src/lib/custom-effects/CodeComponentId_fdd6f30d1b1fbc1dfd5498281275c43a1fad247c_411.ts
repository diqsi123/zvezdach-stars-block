// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
export function setup(device, frame) {
    var SHADER = `
diagnostic(off,derivative_uniformity);

struct Uniforms {
  frameData:       vec4f, // [unused, outputWidth, outputHeight, outputPad]
  inputDimsAndPad: vec4f, // [inputWidth, inputHeight, inputPad, unused]
  amplitude:       vec4f, // [amplitude, 0, 0, 0]
  frequency:       vec4f, // [frequency, 0, 0, 0]
  centerPoint:     vec4f, // [cx%, cy%, 0, 0]
  warpMode:        vec4f, // [warpModeFloat, 0, 0, 0]
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = uv;
  return out;
}

fn computeWarpedUv(outUv: vec2f) -> vec2f {
  let outputWidth  = u.frameData.y;
  let outputHeight = u.frameData.z;
  let outputPad    = u.frameData.w;
  let inputWidth   = u.inputDimsAndPad.x;
  let inputHeight  = u.inputDimsAndPad.y;
  let inputPad     = u.inputDimsAndPad.z;

  // Output UV -> output pixel coords (content space, no pad)
  let outPx = outUv * vec2f(outputWidth, outputHeight);
  // Content UV (removing output padding)
  let contentUv = (outPx - vec2f(outputPad)) / vec2f(outputWidth - 2.0*outputPad, outputHeight - 2.0*outputPad);

  let amplitude = u.amplitude.x;
  let frequency = u.frequency.x;
  let centerUv  = u.centerPoint.xy / 100.0;
  let warpMode  = i32(u.warpMode.x + 0.5);

  let uv       = contentUv;
  let relUv    = uv - centerUv;
  let dist     = length(relUv);
  let scaledA  = amplitude * 5.0;
  let scaledF  = frequency * 2.0;
  // Dynamic radius: distance from center to farthest corner, so the effect
  // always covers the entire canvas even when the center is off-center.
  let coverR   = max(max(length(centerUv - vec2f(0.0, 0.0)), length(centerUv - vec2f(1.0, 0.0))),
                     max(length(centerUv - vec2f(0.0, 1.0)), length(centerUv - vec2f(1.0, 1.0))));

  var warpedUv: vec2f;

  if (warpMode == 0) {
    // Sine wave
    let offsetX = (amplitude / 20.0) * sin(6.2831853 * frequency * relUv.y);
    let offsetY = (amplitude / 20.0) * sin(6.2831853 * frequency * relUv.x);
    warpedUv = uv + vec2f(offsetX, offsetY);
  } else if (warpMode == 1) {
    // Twist
    let f = clamp(1.0 - dist / coverR, 0.0, 1.0);
    let angle = (scaledA / 100.0) * 6.2831853 * scaledF * f;
    let c = cos(angle);
    let s = sin(angle);
    let rotated = vec2f(relUv.x * c - relUv.y * s, relUv.x * s + relUv.y * c);
    warpedUv = centerUv + rotated;
  } else if (warpMode == 2) {
    // Bulge
    let factor = clamp(1.0 - dist * 2.0 / max(scaledF * 2.0, 0.0001), 0.0, 1.0);
    warpedUv = uv - relUv * (scaledA / 100.0) * factor;
  } else if (warpMode == 3) {
    // Pinch
    let factor = clamp(1.0 - dist * 2.0 / max(scaledF * 2.0, 0.0001), 0.0, 1.0);
    warpedUv = uv + relUv * (scaledA / 100.0) * factor;
  } else if (warpMode == 4) {
    // Ripple
    let mag = (scaledA / 100.0) * sin(6.2831853 * scaledF * dist);
    var dir: vec2f;
    if (dist < 0.0001) {
      dir = vec2f(0.0);
    } else {
      dir = relUv / dist;
    }
    warpedUv = uv + dir * mag;
  } else if (warpMode == 5) {
    // Flag
    let offsetX = (scaledA / 100.0) * sin(6.2831853 * scaledF * (relUv.y + relUv.x * 0.3));
    warpedUv = uv + vec2f(offsetX, 0.0);
  } else if (warpMode == 6) {
    // Squeeze
    let offsetY = -(scaledA / 100.0) * relUv.y * sin(6.2831853 * scaledF * uv.x);
    warpedUv = uv + vec2f(0.0, offsetY);
  } else {
    // Swirl (mode 7)
    let f = clamp(1.0 - dist / coverR, 0.0, 1.0);
    let angle = (scaledA / 100.0) * 6.2831853 * scaledF * f * f;
    let c = cos(angle);
    let s = sin(angle);
    let rotated = vec2f(relUv.x * c - relUv.y * s, relUv.x * s + relUv.y * c);
    warpedUv = centerUv + rotated;
  }

  // Map warped content UV -> input texture UV (with padding)
  let inputContent = vec2f(inputWidth - 2.0 * inputPad, inputHeight - 2.0 * inputPad);
  let inputTexUv = (warpedUv * inputContent + vec2f(inputPad)) / vec2f(inputWidth, inputHeight);
  return inputTexUv;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let outUv = in.uv;

  let inputWidth   = u.inputDimsAndPad.x;
  let inputHeight  = u.inputDimsAndPad.y;
  let outputWidth  = u.frameData.y;
  let outputHeight = u.frameData.z;

  // Finite differences in output UV space (one output pixel)
  let duvdx = vec2f(1.0 / outputWidth, 0.0);
  let duvdy = vec2f(0.0, 1.0 / outputHeight);

  let wc   = computeWarpedUv(outUv);
  let wcx  = computeWarpedUv(outUv + duvdx);
  let wcy  = computeWarpedUv(outUv + duvdy);

  // Gradient in texels for footprint-based super-sampling
  let gx = (wcx - wc) * vec2f(inputWidth, inputHeight);
  let gy = (wcy - wc) * vec2f(inputWidth, inputHeight);
  let footprint = max(length(gx), length(gy));
  let MAX_GRID = 6;
  let N = clamp(i32(ceil(footprint)), 1, MAX_GRID);
  let fN = f32(N);

  // Jittered NxN accumulation. No mask blending — the radial falloff is already
  // baked into computeWarpedUv (Swirl/Twist angle → 0 at coverR, Bulge/Pinch
  // factor → 0 outside the lens), so warpedUv naturally equals uv at the boundary.
  var colorSum = vec4f(0.0);

  for (var j = 0; j < MAX_GRID; j++) {
    for (var i = 0; i < MAX_GRID; i++) {
      if (i >= N || j >= N) { continue; }
      let fi = f32(i);
      let fj = f32(j);
      let jitterX = (fi + 0.5) / fN - 0.5;
      let jitterY = (fj + 0.5) / fN - 0.5;
      let sampleUv = outUv + vec2f(jitterX / outputWidth, jitterY / outputHeight);
      let texUv = clamp(computeWarpedUv(sampleUv), vec2f(0.0), vec2f(1.0));
      colorSum += textureSampleLevel(inputTex, samp, texUv, 0.0);
    }
  }

  return colorSum / f32(N * N);
}
`;
    frame.state.shaderModule = device.createShaderModule({ code: SHADER });
    frame.state.uniformBuf = device.createBuffer({
        size: 96,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.sampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
}
export function render(device, frame) {
    if (frame.input == null)
        return;
    var p = frame.params;
    var warpMode = p.warpType;
    var amplitude = p.amplitude;
    var frequency = p.frequency;
    var cx = p.centerPoint.x;
    var cy = p.centerPoint.y;
    var outputWidth = frame.output.width;
    var outputHeight = frame.output.height;
    var inputWidth = frame.input.width;
    var inputHeight = frame.input.height;
    // Padding: use 0 — the runtime already provides the texture as-is
    var outputPad = 0.0;
    var inputPad = 0.0;
    var uniforms = new Float32Array(24);
    // frameData: [unused, outputWidth, outputHeight, outputPad]
    uniforms[0] = 0.0;
    uniforms[1] = outputWidth;
    uniforms[2] = outputHeight;
    uniforms[3] = outputPad;
    // inputDimsAndPad: [inputWidth, inputHeight, inputPad, 0]
    uniforms[4] = inputWidth;
    uniforms[5] = inputHeight;
    uniforms[6] = inputPad;
    uniforms[7] = 0.0;
    // amplitude
    uniforms[8] = amplitude;
    uniforms[9] = 0.0;
    uniforms[10] = 0.0;
    uniforms[11] = 0.0;
    // frequency
    uniforms[12] = frequency;
    uniforms[13] = 0.0;
    uniforms[14] = 0.0;
    uniforms[15] = 0.0;
    // centerPoint
    uniforms[16] = cx;
    uniforms[17] = cy;
    uniforms[18] = 0.0;
    uniforms[19] = 0.0;
    // warpMode
    uniforms[20] = warpMode;
    uniforms[21] = 0.0;
    uniforms[22] = 0.0;
    uniforms[23] = 0.0;
    device.queue.writeBuffer(frame.state.uniformBuf, 0, uniforms);
    if (frame.state.pipelineFormat !== frame.output.format) {
        frame.state.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: frame.state.shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                        arrayStride: 16,
                        attributes: [
                            { shaderLocation: 0, format: 'float32x2', offset: 0 },
                            { shaderLocation: 1, format: 'float32x2', offset: 8 },
                        ],
                    }],
            },
            fragment: {
                module: frame.state.shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: frame.output.format }],
            },
            primitive: { topology: 'triangle-list' },
        });
        frame.state.pipelineFormat = frame.output.format;
    }
    var bindGroup = device.createBindGroup({
        layout: frame.state.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frame.state.uniformBuf } },
            { binding: 1, resource: frame.state.sampler },
            { binding: 2, resource: frame.input.createView() },
        ],
    });
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.output.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            }],
    });
    pass.setPipeline(frame.state.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    warpType: {
        type: "number",
        label: "Type",
        defaultValue: 0,
        control: "select",
        options: [
            { value: 0, label: "Sine wave" },
            { value: 1, label: "Twist" },
            { value: 2, label: "Bulge" },
            { value: 3, label: "Pinch" },
            { value: 4, label: "Ripple" },
            { value: 5, label: "Flag" },
            { value: 6, label: "Squeeze" },
            { value: 7, label: "Swirl" },
        ],
    },
    amplitude: {
        type: "number",
        label: "Amplitude",
        defaultValue: 3,
        control: "slider",
        min: 0,
        max: 20,
        step: 0.1,
    },
    frequency: {
        type: "number",
        label: "Frequency",
        defaultValue: 1,
        control: "slider",
        min: 0,
        max: 5,
        step: 0.05,
    },
    centerPoint: {
        type: "point",
        label: "Center",
        defaultValue: { x: 50, y: 50 },
        control: "point",
        mode: "canvas_and_ui",
        unit: "%",
    },
});

export const manifest = {
  "name": "Warp",
  "version": 2,
  "isAnimated": false,
  "usesMouse": false
}
