import fragSource from './scenes.frag?raw';

const vertSource = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Scroll-driven values, set by main.js; the render loop reads them.
export const SCENES = 8;
// progress is keyed by scene index; an object, so GSAP tweens its keys rather than treating it as a target list
export const view = { pos: 0, progress: Object.fromEntries([...Array(SCENES).keys()].map((i) => [i, 0])), mouse: [0, 0] };

export function createRenderer(canvas, { reducedMotion }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available');

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSource));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  // one triangle that covers the screen
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = Object.fromEntries(
    ['uRes', 'uTime', 'uMouse', 'uA', 'uB', 'uMix', 'uPA', 'uPB'].map((n) => [n, gl.getUniformLocation(prog, n)])
  );

  // full device resolution (up to 4K) when the GPU keeps up; steps down only if frames get slow
  const maxScale = Math.min(devicePixelRatio, 2);
  let scale = maxScale;
  let frameTimes = [];
  const resize = () => {
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  const adapt = (dt) => {
    frameTimes.push(dt);
    if (frameTimes.length < 40) return;
    const avg = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
    frameTimes = [];
    const next = avg > 22 ? Math.max(0.6, scale * 0.85) : avg < 12 ? Math.min(maxScale, scale * 1.1) : scale;
    if (Math.abs(next - scale) > 0.01) {
      scale = next;
      resize();
    }
  };

  let last = performance.now();
  const start = last;
  const frame = (now) => {
    adapt(now - last);
    last = now;
    const max = SCENES - 1;
    const pos = Math.min(Math.max(view.pos, 0), max);
    const a = Math.floor(pos);
    const b = Math.min(a + 1, max);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, reducedMotion ? 12 : (now - start) / 1000);
    gl.uniform2f(u.uMouse, view.mouse[0], view.mouse[1]);
    gl.uniform1i(u.uA, a);
    gl.uniform1i(u.uB, b);
    gl.uniform1f(u.uMix, pos - a);
    gl.uniform1f(u.uPA, view.progress[a]);
    gl.uniform1f(u.uPB, view.progress[b]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  };

  return { start: () => requestAnimationFrame(frame), resize };
}
