// The cinematic pass. The world is drawn with Canvas 2D into an offscreen canvas; this module
// lights it (normal maps, dynamic lights, specular, light caught in drifting fog), adds bloom,
// anamorphic streaks, god rays, heat haze and shockwaves, then grades it like film:
// a soft shoulder, split toning, vignette, chromatic fringe and grain. If WebGL is missing,
// init() returns false and the game shows the plain 2D frame instead.

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const HEADER = `
precision highp float;
varying vec2 vUv;
`;

// ---------------------------------------------------------------- lighting + distortion

const FS_LIGHT = (MAXL) => `${HEADER}
#define MAXL ${MAXL}
uniform sampler2D uScene;
uniform sampler2D uNorm;
uniform sampler2D uDetail;
uniform sampler2D uNoise;
uniform vec2 uRes;        // scene texture size in px
uniform float uRs;        // texture px per logical px
uniform vec4 uView;       // focus x, focus y, zoom, 0 (logical px)
uniform vec2 uCam;        // camera + shake (world px)
uniform float uTime;
uniform int uCount;
uniform vec4 uLP[MAXL];   // screen x, screen y (logical px), radius, height
uniform vec4 uLC[MAXL];   // rgb, intensity
uniform vec3 uAmbient;
uniform vec4 uMat[8];     // spec strength, shininess, detail amount, detail bump
uniform vec4 uMatW[8];    // detail channel weights
uniform vec4 uFog;        // density, scatter, ground fog, drift
uniform vec3 uFogCol;
uniform vec4 uWaves[4];   // screen x, y, radius, strength (px)
uniform vec4 uHeat;       // strength, screen y where it starts, fade height, 0
uniform float uStore;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes / uRs;
  vec2 w = (p - uView.xy) / uView.z + uView.xy + uCam;

  // shockwave rings and heat shimmer bend the picture before anything is lit
  vec2 off = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 wv = uWaves[i];
    if (wv.w <= 0.0) continue;
    vec2 d = p - wv.xy;
    float dist = length(d) + 0.0001;
    float band = (dist - wv.z) / 22.0;
    off += (d / dist) * exp(-band * band) * wv.w;
  }
  if (uHeat.x > 0.0) {
    float m = smoothstep(uHeat.y - uHeat.z, uHeat.y, p.y);
    vec2 n1 = texture2D(uNoise, w * 0.0035 + vec2(0.0, uTime * 0.18)).rg - 0.5;
    vec2 n2 = texture2D(uNoise, w * 0.0081 + vec2(uTime * 0.05, uTime * 0.31)).rg - 0.5;
    off += (n1 + n2 * 0.6) * uHeat.x * 7.0 * m;
  }
  vec2 suv = vUv + vec2(off.x, -off.y) * uRs / uRes;
  vec3 albedo = texture2D(uScene, suv).rgb;

  // normal buffer: premultiplied rg = normal, b = material, a = coverage
  vec4 nt = texture2D(uNorm, suv);
  float cov = nt.a;
  vec3 N = vec3(0.0, 0.0, 1.0);
  float mat = 0.0;
  if (cov > 0.02) {
    vec3 nr = nt.rgb / cov;
    N.xy = nr.rg * 2.0 - 1.0;
    N.z = sqrt(max(0.06, 1.0 - dot(N.xy, N.xy)));
    mat = floor(nr.b * 7.99 + 0.001);
  }
  vec4 M = vec4(0.0, 16.0, 0.0, 0.0);
  vec4 MW = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    if (float(k) == mat) { M = uMat[k]; MW = uMatW[k]; }
  }

  // fine surface detail, tiled in world space so it stays crisp at any zoom
  if (cov > 0.02 && M.z > 0.0) {
    vec2 duv = w / 512.0;
    float h0 = dot(texture2D(uDetail, duv), MW);
    float hx = dot(texture2D(uDetail, duv + vec2(1.0 / 512.0, 0.0)), MW);
    float hy = dot(texture2D(uDetail, duv + vec2(0.0, 1.0 / 512.0)), MW);
    float hm = dot(vec4(0.498, 0.729, 0.565, 0.51), MW);
    albedo *= 1.0 + (h0 - hm) * M.z * 1.6 * cov;
    N = normalize(N + vec3(-(hx - h0), -(hy - h0), 0.0) * M.w * 6.0 * cov);
  }

  vec3 light = vec3(0.0);
  vec3 spec = vec3(0.0);
  vec3 glow = vec3(0.0);
  for (int i = 0; i < MAXL; i++) {
    if (i >= uCount) break;
    vec4 L = uLP[i];
    vec2 d = L.xy - p;
    float dist = length(d);
    float a = max(0.0, 1.0 - dist / L.z);
    if (a <= 0.0) continue;
    a *= a;
    vec3 ld = normalize(vec3(d, L.w));
    float ndl = max(dot(N, ld), 0.0);
    vec3 lc = uLC[i].rgb * uLC[i].a;
    light += lc * a * mix(0.5, ndl * 1.4, cov);
    vec3 hv = normalize(ld + vec3(0.0, 0.0, 1.0));
    spec += lc * a * pow(max(dot(N, hv), 0.0), M.y) * M.x * cov;
    glow += lc * a * a * 0.3;
  }
  // stacked lights saturate softly instead of blowing out
  light = uAmbient + light / (1.0 + light * 0.55);
  spec = spec / (1.0 + spec);
  glow = glow / (1.0 + glow * 1.5);

  // fog that drifts through the room and catches the light
  float f1 = texture2D(uNoise, w * 0.0011 + vec2(uTime * uFog.w, 0.0)).b;
  float f2 = texture2D(uNoise, w * 0.0037 - vec2(uTime * uFog.w * 0.7, uTime * 0.004)).a;
  float fog = f1 * 0.65 + f2 * 0.35;
  vec3 col = albedo * light + spec;
  col += glow * uFog.y * (0.35 + fog * 1.2);
  col = mix(col, uFogCol * (0.45 + fog * 0.6), clamp(uFog.x * fog * (1.0 - cov * 0.7), 0.0, 1.0));
  gl_FragColor = vec4(col * uStore, 1.0);
}
`;

// ---------------------------------------------------------------- bloom chain

const FS_BRIGHT = `${HEADER}
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThresh;
uniform float uKnee;
uniform float uInv;
uniform float uStore;
void main() {
  vec3 c = texture2D(uTex, vUv + vec2(-uTexel.x, -uTexel.y)).rgb;
  c += texture2D(uTex, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  c += texture2D(uTex, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
  c += texture2D(uTex, vUv + vec2(uTexel.x, uTexel.y)).rgb;
  c *= 0.25 * uInv;
  float l = max(max(c.r, c.g), c.b);
  float soft = clamp(l - uThresh + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 0.0001);
  float k = max(soft, l - uThresh) / max(l, 0.0001);
  gl_FragColor = vec4(c * k * uStore, 1.0);
}
`;

const FS_DOWN = `${HEADER}
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 4.0;
  s += texture2D(uTex, vUv - uTexel).rgb;
  s += texture2D(uTex, vUv + uTexel).rgb;
  s += texture2D(uTex, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  s += texture2D(uTex, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}
`;

const FS_UP = `${HEADER}
uniform sampler2D uTex;
uniform sampler2D uAdd;
uniform vec2 uTexel;
uniform float uAddW;
void main() {
  vec3 s = texture2D(uTex, vUv + vec2(-uTexel.x * 2.0, 0.0)).rgb;
  s += texture2D(uTex, vUv + vec2(-uTexel.x, uTexel.y)).rgb * 2.0;
  s += texture2D(uTex, vUv + vec2(0.0, uTexel.y * 2.0)).rgb;
  s += texture2D(uTex, vUv + vec2(uTexel.x, uTexel.y)).rgb * 2.0;
  s += texture2D(uTex, vUv + vec2(uTexel.x * 2.0, 0.0)).rgb;
  s += texture2D(uTex, vUv + vec2(uTexel.x, -uTexel.y)).rgb * 2.0;
  s += texture2D(uTex, vUv + vec2(0.0, -uTexel.y * 2.0)).rgb;
  s += texture2D(uTex, vUv + vec2(-uTexel.x, -uTexel.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(uAdd, vUv).rgb * uAddW, 1.0);
}
`;

// wide horizontal smear of the brightest things: the anamorphic lens streak
const FS_STREAK = `${HEADER}
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uStep;
void main() {
  vec3 s = vec3(0.0);
  float ws = 0.0;
  for (int i = -7; i <= 7; i++) {
    float w = exp(-abs(float(i)) * 0.32);
    s += texture2D(uTex, vUv + vec2(float(i) * uStep * uTexel.x, 0.0)).rgb * w;
    ws += w;
  }
  gl_FragColor = vec4(s / ws, 1.0);
}
`;

// light pouring out of a bright source, sampled toward it
const FS_RAYS = `${HEADER}
uniform sampler2D uTex;
uniform vec2 uCenter;
uniform float uDecay;
uniform float uDensity;
void main() {
  vec2 d = (vUv - uCenter) * uDensity / 36.0;
  vec2 uv = vUv;
  vec3 s = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 36; i++) {
    uv -= d;
    s += texture2D(uTex, uv).rgb * w;
    w *= uDecay;
  }
  gl_FragColor = vec4(s / 14.0, 1.0);
}
`;

// ---------------------------------------------------------------- final grade

const FS_FINAL = `${HEADER}
uniform sampler2D uLit;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform sampler2D uRays;
uniform vec2 uOut;
uniform float uInv;
uniform float uBloomK;
uniform float uStreakK;
uniform float uRaysK;
uniform vec3 uStreakTint;
uniform vec3 uRaysTint;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVig;
uniform float uCA;
uniform float uGrain;
uniform float uTime;
uniform vec4 uTint;
uniform vec4 uFlash;
uniform float uFade;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 scene(vec2 uv) {
  vec3 c = texture2D(uLit, uv).rgb;
  c += texture2D(uBloom, uv).rgb * uBloomK;
  c += texture2D(uStreak, uv).rgb * uStreakK * uStreakTint;
  c += texture2D(uRays, uv).rgb * uRaysK * uRaysTint;
  return c * uInv;
}
void main() {
  vec2 uv = vUv;
  vec2 dc = uv - 0.5;
  float r2 = dot(dc, dc);
  vec2 ca = dc * uCA * (0.25 + r2 * 2.5);
  vec3 col = vec3(scene(uv + ca).r, scene(uv).g, scene(uv - ca).b);
  col *= uExposure;
  // keep everything under 0.72 untouched, roll highlights off like film
  vec3 x = max(col - 0.72, 0.0);
  col = min(col, 0.72) + x / (1.0 + x / 0.32);
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + uHighTint * smoothstep(0.45, 1.0, l);
  col = uGain * (col + uLift * (1.0 - col));
  col = pow(max(col, 0.0), 1.0 / uGamma);
  float edge = smoothstep(0.08, 0.62, r2 * 2.0);
  col *= 1.0 - uVig * edge;
  col = mix(col, uTint.rgb, uTint.a * edge);
  col += uFlash.rgb * uFlash.a;
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7) - 0.5;
  float gl2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += g * uGrain * (0.35 + 0.65 * (1.0 - abs(gl2 * 2.0 - 1.0)));
  col *= 1.0 - uFade;
  col += (hash(gl_FragCoord.yx + 17.0) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------- the pipeline

export class Post {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.targets = null;
  }

  init() {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = null;
    try { gl = this.canvas.getContext('webgl2', opts); } catch (e) {}
    this.gl2 = !!gl;
    if (!gl) try { gl = this.canvas.getContext('webgl', opts); } catch (e) {}
    if (!gl) return false;
    this.gl = gl;
    this.pickFormat();
    const maxVec = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 64;
    this.maxl = Math.max(8, Math.min(24, Math.floor((maxVec - 40) / 2)));
    try {
      this.pLight = this.program(FS_LIGHT(this.maxl));
      this.pBright = this.program(FS_BRIGHT);
      this.pDown = this.program(FS_DOWN);
      this.pUp = this.program(FS_UP);
      this.pStreak = this.program(FS_STREAK);
      this.pRays = this.program(FS_RAYS);
      this.pFinal = this.program(FS_FINAL);
    } catch (e) {
      console.warn('post: shaders failed, using the plain picture', e);
      return false;
    }
    this.tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.texScene = this.texture();
    this.texNorm = this.texture();
    this.texDetail = this.texture(true);
    this.texNoise = this.texture(true);
    this.black = this.texture();
    gl.bindTexture(gl.TEXTURE_2D, this.black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; this.lost = true; }, false);
    this.ok = true;
    return true;
  }

  // float render targets when the device has them, otherwise 8-bit targets stored at half brightness
  pickFormat() {
    const gl = this.gl;
    this.fmt = { internal: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this.store = 0.5;
    if (this.gl2 && gl.getExtension('EXT_color_buffer_float')) {
      this.fmt = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
      this.store = 1;
    } else if (!this.gl2) {
      const hf = gl.getExtension('OES_texture_half_float');
      const lin = gl.getExtension('OES_texture_half_float_linear');
      const cb = gl.getExtension('EXT_color_buffer_half_float');
      if (hf && lin && cb) {
        this.fmt = { internal: gl.RGBA, format: gl.RGBA, type: hf.HALF_FLOAT_OES };
        this.store = 1;
      }
    }
  }

  program(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 12).join('\n'));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  texture(repeat = false) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  target(w, h) {
    const gl = this.gl;
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const tex = this.texture();
    const make = (fmt) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const okFb = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return okFb ? fb : null;
    };
    let fb = make(this.fmt);
    if (!fb && this.fmt.type !== gl.UNSIGNED_BYTE) {
      this.fmt = { internal: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
      this.store = 0.5;
      fb = make(this.fmt);
    }
    return { tex, fb, w, h };
  }

  // static textures: tileable surface detail and drifting noise, raw RGBA so all four channels hold data
  setData(tex, bytes, size) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }
  setDetail(bytes, size) { this.setData(this.texDetail, bytes, size); }
  setNoise(bytes, size) { this.setData(this.texNoise, bytes, size); }

  upload(tex, src, premult) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premult);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  resize(outW, outH, sceneW, sceneH) {
    this.canvas.width = outW;
    this.canvas.height = outH;
    if (this.targets && this.targets.sw === sceneW && this.targets.sh === sceneH) return;
    const gl = this.gl;
    if (this.targets) {
      for (const t of this.targets.all) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    }
    const all = [];
    const T = (w, h) => { const t = this.target(w, h); all.push(t); return t; };
    const lit = T(sceneW, sceneH);
    const down = [], up = [];
    let w = sceneW / 2, h = sceneH / 2;
    for (let i = 0; i < 5; i++) {
      down.push(T(w, h));
      w /= 2;
      h /= 2;
    }
    for (let i = 0; i < 4; i++) up.push(T(down[i].w, down[i].h));
    const streakA = T(sceneW / 4, sceneH / 4), streakB = T(sceneW / 4, sceneH / 4);
    const rays = T(sceneW / 4, sceneH / 4);
    this.targets = { sw: sceneW, sh: sceneH, lit, down, up, streakA, streakB, rays, all };
  }

  pass(prog, target, setup) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    let unit = 0;
    const bind = (name, tex) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (prog.u[name]) gl.uniform1i(prog.u[name], unit);
      unit++;
    };
    setup(prog.u, bind);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(scene, norm, P) {
    if (!this.ok) return;
    const gl = this.gl;
    const T = this.targets;
    const store = this.store, inv = 1 / store;
    this.upload(this.texScene, scene, false);
    if (norm) this.upload(this.texNorm, norm, true);
    const lightsP = P.lightsP, lightsC = P.lightsC;

    this.pass(this.pLight, T.lit, (u, bind) => {
      bind('uScene', this.texScene);
      bind('uNorm', norm ? this.texNorm : this.black);
      bind('uDetail', this.texDetail);
      bind('uNoise', this.texNoise);
      gl.uniform2f(u.uRes, T.sw, T.sh);
      gl.uniform1f(u.uRs, P.rs);
      gl.uniform4f(u.uView, P.fx, P.fy, P.zoom, 0);
      gl.uniform2f(u.uCam, P.camX, P.camY);
      gl.uniform1f(u.uTime, P.time);
      gl.uniform1i(u.uCount, P.lightCount);
      gl.uniform4fv(u.uLP, lightsP);
      gl.uniform4fv(u.uLC, lightsC);
      gl.uniform3fv(u.uAmbient, P.ambient);
      gl.uniform4fv(u.uMat, P.mat);
      gl.uniform4fv(u.uMatW, P.matW);
      gl.uniform4fv(u.uFog, P.fog);
      gl.uniform3fv(u.uFogCol, P.fogCol);
      gl.uniform4fv(u.uWaves, P.waves);
      gl.uniform4fv(u.uHeat, P.heat);
      gl.uniform1f(u.uStore, store);
    });

    // bloom: bright pass, four halvings, then back up adding each level
    const D = T.down, U = T.up;
    this.pass(this.pBright, D[0], (u, bind) => {
      bind('uTex', T.lit.tex);
      gl.uniform2f(u.uTexel, 0.5 / T.sw, 0.5 / T.sh);
      gl.uniform1f(u.uThresh, P.bloomThresh);
      gl.uniform1f(u.uKnee, 0.18);
      gl.uniform1f(u.uInv, inv);
      gl.uniform1f(u.uStore, store);
    });
    for (let i = 1; i < D.length; i++) {
      this.pass(this.pDown, D[i], (u, bind) => {
        bind('uTex', D[i - 1].tex);
        gl.uniform2f(u.uTexel, 0.5 / D[i - 1].w, 0.5 / D[i - 1].h);
      });
    }
    let src = D[D.length - 1];
    for (let i = D.length - 2; i >= 0; i--) {
      const dst = U[i];
      this.pass(this.pUp, dst, (u, bind) => {
        bind('uTex', src.tex);
        bind('uAdd', D[i].tex);
        gl.uniform2f(u.uTexel, 0.5 / src.w, 0.5 / src.h);
        gl.uniform1f(u.uAddW, 1.0);
      });
      src = dst;
    }
    const bloom = U[0];

    // anamorphic streak from the quarter-size bright buffer
    let streak = this.black;
    if (P.streakK > 0.001) {
      const steps = [1.0, 3.5, 11.0];
      let from = D[1], to = T.streakA;
      for (let i = 0; i < steps.length; i++) {
        this.pass(this.pStreak, to, (u, bind) => {
          bind('uTex', from.tex);
          gl.uniform2f(u.uTexel, 1 / from.w, 1 / from.h);
          gl.uniform1f(u.uStep, steps[i]);
        });
        from = to;
        to = to === T.streakA ? T.streakB : T.streakA;
      }
      streak = from.tex;
    }

    let rays = this.black;
    if (P.raysK > 0.001) {
      this.pass(this.pRays, T.rays, (u, bind) => {
        bind('uTex', D[1].tex);
        gl.uniform2f(u.uCenter, P.raysX, P.raysY);
        gl.uniform1f(u.uDecay, 0.955);
        gl.uniform1f(u.uDensity, 0.9);
      });
      rays = T.rays.tex;
    }

    this.pass(this.pFinal, null, (u, bind) => {
      bind('uLit', T.lit.tex);
      bind('uBloom', bloom.tex);
      bind('uStreak', streak);
      bind('uRays', rays);
      gl.uniform2f(u.uOut, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.uInv, inv);
      gl.uniform1f(u.uBloomK, P.bloomK);
      gl.uniform1f(u.uStreakK, P.streakK);
      gl.uniform1f(u.uRaysK, P.raysK);
      gl.uniform3fv(u.uStreakTint, P.streakTint);
      gl.uniform3fv(u.uRaysTint, P.raysTint);
      gl.uniform1f(u.uExposure, P.exposure);
      gl.uniform3fv(u.uLift, P.lift);
      gl.uniform3fv(u.uGamma, P.gamma);
      gl.uniform3fv(u.uGain, P.gain);
      gl.uniform1f(u.uSat, P.sat);
      gl.uniform1f(u.uContrast, P.contrast);
      gl.uniform3fv(u.uShadowTint, P.shadowTint);
      gl.uniform3fv(u.uHighTint, P.highTint);
      gl.uniform1f(u.uVig, P.vig);
      gl.uniform1f(u.uCA, P.ca);
      gl.uniform1f(u.uGrain, P.grain);
      gl.uniform1f(u.uTime, P.time);
      gl.uniform4fv(u.uTint, P.tint);
      gl.uniform4fv(u.uFlash, P.flash);
      gl.uniform1f(u.uFade, P.fade);
    });
  }
}
