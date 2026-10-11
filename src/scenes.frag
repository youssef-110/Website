#version 300 es
// Every scene on the page, drawn per pixel at the screen's own resolution.
// uA/uB are the scenes either side of a transition, uMix how far the wipe has gone,
// uPA/uPB each scene's own scroll progress (0..1).
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform int uA;
uniform int uB;
uniform float uMix;
uniform float uPA;
uniform float uPB;

out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) {
  float n = hash(p);
  return vec2(n, hash(p + n));
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
vec3 hue(float h) {
  return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
float stars(vec2 p, float density) {
  vec2 g = p * density;
  vec2 id = floor(g), f = fract(g) - 0.5;
  vec2 o = hash2(id) - 0.5;
  float b = hash(id + 7.3);
  float s = smoothstep(0.07, 0.0, length(f - o * 0.8)) * step(0.86, b) * (b - 0.86) * 7.0;
  return s * (0.7 + 0.3 * sin(uTime * 2.0 + b * 40.0));
}

// 0 / 7: first light, a thin horizon that opens up
vec3 sceneDawn(vec2 p, float pr) {
  float y = p.y + 0.14;
  float width = exp(-p.x * p.x * mix(7.0, 0.7, pr));
  vec3 col = vec3(0.003, 0.004, 0.01);
  col += stars(p, 70.0) * smoothstep(0.0, 0.3, y) * (1.0 - pr * 0.6);
  col += vec3(1.0, 0.45, 0.18) * exp(-abs(y) * mix(70.0, 12.0, pr)) * width * mix(0.5, 1.2, pr);
  col += vec3(1.0, 0.85, 0.7) * exp(-abs(y) * 500.0) * width * 2.0;
  col += vec3(0.35, 0.12, 0.25) * exp(-max(y, 0.0) * 5.0) * width * 0.35 * pr;
  if (y < 0.0) col *= 0.2 + 0.8 * exp(y * 35.0);
  return col;
}

// 1: Rayleigh scattering, the sun sets as pr goes 0 -> 1
vec3 sceneSky(vec2 p, float pr) {
  float sunE = mix(0.42, 0.012, pr);
  vec2 sun = vec2(0.32, sunE - 0.12);
  float h = p.y + 0.12;
  vec3 beta = vec3(0.16, 0.37, 0.9); // relative to 1/wavelength^4 for ~680, 550, 440 nm
  vec3 sunLight = exp(-beta * 0.22 / (max(sunE, 0.0) + 0.035));
  vec3 col = sunLight * (1.0 - exp(-beta * 0.55 / (max(h, 0.0) + 0.035)));
  col *= vec3(0.9, 0.95, 1.0) * 0.95;
  float d = length(p - sun);
  col += sunLight * vec3(1.0, 0.92, 0.75) * (exp(-d * 9.0) * 0.4 + smoothstep(0.034, 0.03, d) * 4.0);
  // near the horizon the cheap model loses the blue overhead, so blend into a dusk gradient
  float dusk = 1.0 - smoothstep(0.02, 0.3, sunE);
  vec3 duskSky = mix(vec3(1.0, 0.32, 0.08), vec3(0.55, 0.12, 0.32), smoothstep(0.0, 0.22, h));
  duskSky = mix(duskSky, vec3(0.04, 0.05, 0.16), smoothstep(0.18, 0.6, h));
  duskSky += vec3(1.0, 0.45, 0.12) * exp(-abs(p.y - sun.y) * 14.0) * exp(-abs(p.x - sun.x) * 2.2) * 0.8;
  duskSky += vec3(1.0, 0.55, 0.3) * smoothstep(0.034, 0.03, d) * 3.0;
  col = mix(col, duskSky, dusk);
  if (h < 0.0) col = mix(sunLight, vec3(1.0, 0.4, 0.15), dusk) * vec3(0.05, 0.04, 0.035) * (1.0 + 4.0 * exp(h * 45.0)) + vec3(0.004);
  return col;
}

// 2: aurora over a lake
vec3 sceneAurora(vec2 p, float pr) {
  float horizon = -0.2;
  vec2 q = p;
  bool water = q.y < horizon;
  if (water) q.y = 2.0 * horizon - q.y + 0.004 * sin(p.y * 260.0 + uTime * 1.5);
  vec3 col = mix(vec3(0.004, 0.008, 0.025), vec3(0.0, 0.02, 0.04), q.y + 0.5);
  col += stars(q, 95.0) * 0.8;
  vec3 a = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float base = 0.0 + fi * 0.09 + 0.07 * sin(q.x * 1.4 + uTime * 0.12 + fi * 2.1)
      + 0.045 * sin(q.x * 4.3 - uTime * 0.21 + fi * 1.3)
      + 0.14 * (fbm(vec2(q.x * 1.3 + fi * 3.0, uTime * 0.05)) - 0.5);
    float dy = q.y - base;
    float curtain = smoothstep(-0.015, 0.0, dy) * exp(-max(dy, 0.0) * mix(8.0, 4.5, fi / 2.0));
    float rays = (0.45 + 0.55 * fbm(vec2(q.x * 16.0 + fi * 10.0, uTime * 0.25)))
      * (0.55 + 0.45 * noise(vec2(q.x * 70.0 + uTime * 0.4, fi)));
    vec3 c = mix(vec3(0.08, 1.0, 0.45), vec3(0.9, 0.12, 0.38), smoothstep(0.02, 0.38, dy));
    a += c * curtain * rays * (0.65 - fi * 0.15);
  }
  col += a * mix(0.3, 1.25, pr);
  float ridge = horizon + 0.05 * fbm(vec2(p.x * 2.4, 1.0)) + 0.035 * noise(vec2(p.x * 11.0, 3.0));
  if (water) col *= 0.42;
  else if (p.y < ridge) col = vec3(0.002, 0.003, 0.006);
  return col;
}

// 3: caustics on a pool floor (bright cell edges of a drifting, warped Voronoi field)
float cellEdge(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(i, j);
      vec2 o = 0.5 + 0.45 * sin(uTime * 0.55 + 6.2831 * hash2(n + g));
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  return f2 - f1;
}
vec3 sceneCaustics(vec2 p, float pr) {
  vec2 q = p * mix(7.0, 4.5, pr);
  q += 0.35 * vec2(fbm(q * 0.6 + uTime * 0.12), fbm(q * 0.6 + vec2(5.2, 1.3) - uTime * 0.1));
  vec2 q2 = q * 1.7 + vec2(3.1, 7.4);
  float s = 0.016;
  vec3 c = vec3(
    pow(smoothstep(0.14, 0.0, cellEdge(q + vec2(s, 0.0))), 2.5) + 0.5 * pow(smoothstep(0.1, 0.0, cellEdge(q2 + vec2(s, 0.0))), 2.5),
    pow(smoothstep(0.14, 0.0, cellEdge(q)), 2.5) + 0.5 * pow(smoothstep(0.1, 0.0, cellEdge(q2)), 2.5),
    pow(smoothstep(0.14, 0.0, cellEdge(q - vec2(s, 0.0))), 2.5) + 0.5 * pow(smoothstep(0.1, 0.0, cellEdge(q2 - vec2(s, 0.0))), 2.5));
  vec3 col = mix(vec3(0.0, 0.08, 0.13), vec3(0.0, 0.26, 0.33), 0.5 + 0.6 * p.y);
  col += c * vec3(0.8, 1.0, 1.0) * 1.6;
  vec2 t = abs(fract((p + vec2(0.0, uTime * 0.004)) * 5.0) - 0.5);
  col *= 0.86 + 0.14 * smoothstep(0.485, 0.47, max(t.x, t.y));
  return col;
}

// 4: dispersion through a prism
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
vec3 scenePrism(vec2 p, float pr) {
  vec3 col = vec3(0.008, 0.008, 0.012) + vec3(0.02) * (1.0 - length(p));
  vec2 c = vec2(-0.05, 0.03);
  float tri = sdTri(p - c, 0.17);
  vec2 entry = c + vec2(-0.085, 0.0);
  float beam = sdSeg(p, vec2(-1.2, -0.16), entry);
  col += vec3(1.0) * (exp(-beam * 260.0) * 1.3 + exp(-beam * 22.0) * 0.08);
  vec2 exitP = c + vec2(0.08, -0.02);
  vec2 d = p - exitP;
  if (d.x > 0.0) {
    float spread = mix(0.06, 0.34, pr);
    float top = -0.12;
    float t = (top - atan(d.y, d.x)) / spread; // 0 = red (bends least), 1 = violet (bends most)
    float band = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
    float len = length(d);
    col += hue(clamp(t, 0.0, 1.0) * 0.78) * band * exp(-len * 0.9) * 1.6 * smoothstep(0.0, 0.03, len);
    col += hue(clamp(t, 0.0, 1.0) * 0.78) * exp(-abs(t - 0.5) * 3.0) * exp(-len * 3.0) * 0.12;
  }
  float through = sdSeg(p, entry, exitP);
  col += vec3(0.9, 0.95, 1.0) * exp(-through * 120.0) * 0.35 * smoothstep(0.005, -0.005, tri);
  vec2 inside = p - c;
  col += vec3(0.85, 0.92, 1.0) * exp(-abs(tri) * 320.0) * 0.7;
  col += vec3(0.6, 0.7, 0.8) * smoothstep(0.0, -0.01, tri) * 0.05 * (1.0 + inside.y * 3.0);
  return col;
}

// 5: bioluminescent plankton; the cursor makes them flash
vec3 sceneBio(vec2 p, float pr) {
  vec3 col = mix(vec3(0.0, 0.004, 0.012), vec3(0.0, 0.03, 0.06), smoothstep(-0.5, 0.7, p.y));
  vec3 glow = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float scale = 7.0 + fl * 6.0;
    vec2 drift = vec2(sin(uTime * 0.07 + fl) * 0.3, uTime * (0.05 + fl * 0.025));
    vec2 q = p * scale + drift * scale * 0.2 + fl * 13.0;
    vec2 id = floor(q), f = fract(q);
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(i, j);
        vec2 cell = id + g;
        float h = hash(cell + 3.1);
        if (h < mix(0.55, 0.15, pr)) continue;
        vec2 o = 0.5 + 0.38 * sin(uTime * (0.3 + h * 0.4) + 6.2831 * hash2(cell));
        float dd = length(g + o - f);
        vec2 world = (cell + o - drift * scale * 0.2 - fl * 13.0) / scale;
        float near = exp(-length(world - uMouse) * 9.0);
        float pulse = pow(0.5 + 0.5 * sin(uTime * (0.8 + h) + h * 40.0), 10.0);
        float b = (0.15 + 1.8 * near + 0.6 * pulse) * (1.0 - fl * 0.25);
        glow += mix(vec3(0.05, 0.75, 1.0), vec3(0.4, 1.0, 0.85), h) * b
          * (smoothstep(0.09, 0.0, dd) * 1.4 + exp(-dd * 9.0) * 0.12);
      }
  }
  return col + glow * 0.9;
}

// 6: gravitational lensing; scrolling slides a galaxy behind the mass until it becomes a ring
vec3 sky6(vec2 s, float pr) {
  vec3 c = vec3(0.004, 0.003, 0.012);
  c += vec3(0.25, 0.08, 0.35) * pow(fbm(s * 2.2 + 4.0), 3.0) * 1.3;
  c += vec3(0.05, 0.12, 0.3) * pow(fbm(s * 3.5 - 2.0), 4.0) * 1.5;
  c += stars(s, 80.0) + stars(s * 1.7 + 3.0, 60.0) * 0.6;
  vec2 gal = vec2(mix(-0.42, 0.0, pr), mix(0.16, 0.0, pr));
  vec2 g = s - gal;
  g = mat2(0.9, -0.44, 0.44, 0.9) * g;
  float r = length(g * vec2(1.0, 2.2));
  c += vec3(1.0, 0.82, 0.62) * (exp(-r * 38.0) * 1.6 + exp(-r * 9.0) * 0.25);
  return c;
}
vec3 sceneLens(vec2 p, float pr) {
  vec2 m = uMouse * 0.04;
  vec2 d = p - m;
  float r2 = dot(d, d) + 1e-5;
  float rE = 0.13;
  vec2 src = p - d * (rE * rE) / r2; // point-mass lens: beta = theta - thetaE^2 / theta
  vec3 col = sky6(src, pr);
  float r = sqrt(r2);
  col += vec3(1.0, 0.85, 0.65) * exp(-abs(r - 0.052) * 140.0) * 0.5;
  col *= smoothstep(0.044, 0.05, r);
  return col;
}

vec3 scene(int i, vec2 p, float pr) {
  if (i == 0) return sceneDawn(p, pr);
  if (i == 1) return sceneSky(p, pr);
  if (i == 2) return sceneAurora(p, pr);
  if (i == 3) return sceneCaustics(p, pr);
  if (i == 4) return scenePrism(p, pr);
  if (i == 5) return sceneBio(p, pr);
  if (i == 6) return sceneLens(p, pr);
  return sceneDawn(p, 1.0 - pr);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 col = scene(uA, p, uPA);
  if (uMix > 0.0) {
    // the next scene slides in from the right behind a soft, glowing edge
    vec3 next = scene(uB, p, uPB);
    vec2 uv = gl_FragCoord.xy / uRes;
    float w = uv.x * 0.8 + (1.0 - uv.y) * 0.2 + (fbm(p * 2.5 + uTime * 0.15) - 0.5) * 0.14;
    float edge = 1.18 - uMix * 1.36;
    col = mix(col, next, smoothstep(edge - 0.015, edge + 0.015, w));
    col += vec3(1.0, 0.95, 0.9) * (exp(-abs(w - edge) * 260.0) * 1.2 + exp(-abs(w - edge) * 40.0) * 0.18) * sin(uMix * 3.14159);
  }
  col = 1.0 - exp(-col * 1.15);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
