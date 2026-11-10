// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
export function setup(device, frame) {
    var wgsl = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData: vec4f,
  inputDimsData: vec4f,
  transform: vec4f,
  pars: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn sampleInput(p: vec2f) -> vec4f {
  return textureSampleLevel(inputTex, samp, clamp(p, vec2f(0.0), vec2f(1.0)), 0.0);
}

fn sampleInputRepeat(p: vec2f) -> vec4f {
  return textureSampleLevel(inputTex, samp, fract(p), 0.0);
}

// Like sampleInput but returns transparent (premultiplied zero) outside the
// input rect instead of repeating the edge texel.
fn sampleInputOrZero(p: vec2f) -> vec4f {
  let inside = step(vec2f(0.0), p) * step(p, vec2f(1.0));
  return sampleInput(p) * (inside.x * inside.y);
}

fn rot(angle: f32) -> mat2x2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat2x2<f32>(c, s, -s, c);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

/// Linear version of smoothstep
fn linearstep(a: f32, b: f32, t: f32) -> f32 {
    return clamp((t - a) / (b - a), 0.0, 1.0);
}

/// Random float in range [0, 1).
fn rand(inF: vec3f) -> f32 {
    var x = bitcast<vec3<u32>>(inF);
    let k = 1103515245u;

    x = ((x >> vec3<u32>(8u)) ^ x.yzx) * k;
    x = ((x >> vec3<u32>(8u)) ^ x.yzx) * k;
    x = ((x >> vec3<u32>(8u)) ^ x.yzx) * k;

    // Random bits
    let outI = x.x ^ x.y ^ x.z;

    // Construct a float between [1, 2) with random mantissa
    //            127 = 2^0                23 bit mantissa
    let outF = (127u << 23u) | (outI & ((1u << 23u) - 1u));

    return bitcast<f32>(outF) - 1.0;
}

fn sliceUV(localPos: vec2f, centerPos: vec2f, blendOffset: f32, t: ptr<function, f32>) -> vec2f {

    let size = u.transform.z;
    let randomSeed = 0.0;
    let random = u.pars.z;
    let shift = u.pars.x;
    let rotation = u.transform.w;

    var p = localPos - centerPos;
    p = rot(rotation) * p;

    let tMult = (p.x - blendOffset) / size + 0.5;
    *t = fract(tMult);

    let stair = floor(tMult);
    let randomize = (rand(vec3f(stair, stair, randomSeed)) - 0.5) * step(0.5, abs(tMult - 0.5));
    p.x = p.x - stair * size * shift;
    p.y = p.y + randomize * random;

    p = rot(-rotation) * p;
    p += centerPos;
    return p;
}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) outputUv_in: vec2f) -> @location(0) vec4f {
  let time = u.frameData.x;
  let outputUv = outputUv_in;
  let dims = max(u.frameData.yz, vec2f(1.0));
  let inputDims = max(u.inputDimsData.xy, vec2f(1.0));
  let inputTexel = vec2f(1.0) / inputDims;
  let centerUV = u.transform.xy;
  let size = u.transform.z;
  var softness = u.pars.y;
  let localPos = outputUv * inputDims;
  let localCenter = centerUV * 0.01 * inputDims;

  var t1 = 0.0;
  var t2 = 0.0;

  softness = min(softness, size * 0.5);
  let uvA = sliceUV(localPos, localCenter, -softness, &t1) / inputDims;
  let uvB = sliceUV(localPos, localCenter, softness, &t2) / inputDims;

  let colA = sampleInputRepeat(uvA);
  let colB = sampleInputRepeat(uvB);

  let normSoft = softness / size;
  let overlap = step(1.001 - normSoft, (t2 + 1.0 - t1));
  let t = t1 / (normSoft * 2.0);

  var color = mix(colB, colA, smoothstep(0.0, 1.0, t * overlap));
  return color;
}
`;
    frame.state.module = device.createShaderModule({
        code: wgsl,
    });
    frame.state.pipeline = null;
    frame.state.pipelineFormat = null;
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, -1, 1, 0, 0, 1, -1,
        1, 1, 1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
    frame.state.uniformBuf = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
    });
    frame.state.placeholder = device.createTexture({
        size: [1, 1, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: frame.state.placeholder }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, { width: 1, height: 1, depthOrArrayLayers: 1 });
}
export function render(device, frame) {
    var params = frame.params || {};
    function finiteNumber(value, fallback) {
        var num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function numberParam(name, fallback) {
        return finiteNumber(params[name], fallback);
    }
    function boolParam(name, fallback) {
        if (typeof params[name] === "boolean")
            return params[name] ? 1 : 0;
        return fallback ? 1 : 0;
    }
    function pointParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
        ];
    }
    function pointRadiusParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.radius, fallback[2]),
        ];
    }
    function pointAngleRadiusParam(name, fallback) {
        var p = params[name];
        if (p && typeof p === "object") {
            return [
                finiteNumber(p.x, fallback[0]),
                finiteNumber(p.y, fallback[1]),
                finiteNumber(p.radius, fallback[2]),
                finiteNumber(p.angle, fallback[3]),
            ];
        }
        return fallback;
    }
    var output = frame.output || {};
    var width = Math.max(1, finiteNumber(output.width, 1));
    var height = Math.max(1, finiteNumber(output.height, 1));
    var time = 0;
    var inputWidth = width;
    var inputHeight = height;
    var t = pointAngleRadiusParam("transform", [50, 50, 8, 0]);
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        time,
        width,
        height,
        0,
        inputWidth,
        inputHeight,
        0,
        0,
        t[0],
        t[1],
        t[2],
        (t[3] * -3.14159265358979) / 180.0,
        numberParam("shift", 0.5) * 0.01,
        Math.max(0.5, numberParam("softness", 0.5)),
        numberParam("random", 0.0),
        0,
    ]));
    var inputView = frame.input != null
        ? frame.input.createView()
        : frame.state.placeholder.createView();
    var outputFormat = frame.output.format;
    if (frame.state.pipeline == null ||
        frame.state.pipelineFormat !== outputFormat) {
        frame.state.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: frame.state.module,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 16,
                        attributes: [
                            {
                                shaderLocation: 0,
                                format: "float32x2",
                                offset: 0,
                            },
                            {
                                shaderLocation: 1,
                                format: "float32x2",
                                offset: 8,
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: frame.state.module,
                entryPoint: "fs_main",
                targets: [{ format: outputFormat }],
            },
            primitive: { topology: "triangle-list" },
        });
        frame.state.pipelineFormat = outputFormat;
    }
    var bindGroup = device.createBindGroup({
        layout: frame.state.pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: frame.state.uniformBuf },
            },
            { binding: 1, resource: frame.state.sampler },
            { binding: 2, resource: inputView },
        ],
    });
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: frame.output.createView(),
                loadOp: "clear",
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: "store",
            },
        ],
    });
    pass.setPipeline(frame.state.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    shift: {
        type: "number",
        label: "Shift",
        defaultValue: 50,
        control: "slider",
        min: -200,
        max: 200,
        step: 1,
        unit: "%",
    },
    softness: {
        type: "number",
        label: "Softness",
        defaultValue: 0,
        control: "slider",
        min: 0,
        max: 100,
        step: 1,
    },
    random: {
        type: "number",
        label: "Random",
        defaultValue: 0,
        control: "slider",
        min: 0,
        max: 500,
        step: 1,
    },
    transform: {
        type: "point-angle-radius",
        label: "Transform",
        defaultValue: { x: 50, y: 50, radius: 100, angle: 0 },
        positionUnit: "%",
    },
});

export const manifest = {
  "name": "Slice shift",
  "version": 2,
  "isAnimated": false,
  "usesMouse": false
}
