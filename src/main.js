import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { createRenderer, view, SCENES } from './gl.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene');
const countEl = document.getElementById('count');
const navLinks = [...document.querySelectorAll('.index a')];

history.scrollRestoration = 'manual';
scrollTo(0, 0);

let renderer;
try {
  renderer = createRenderer(canvas, { reducedMotion });
} catch (err) {
  console.error(err);
  document.querySelector('.ch__hint').textContent = 'This page needs WebGL 2. Open it in a recent Chrome, Edge, Firefox or Safari.';
}
if (renderer) init();

async function init() {
  await document.fonts.ready;
  const chapters = [...document.querySelectorAll('[data-ch]')].map((el) => ({
    el,
    chars: SplitText.create(el.querySelector('[data-split]'), { type: 'words,chars', mask: 'chars', charsClass: 'char' }).chars,
    title: el.querySelector('.ch__title'),
    rest: [...el.querySelectorAll('.ch__num, .ch__side > *')],
  }));
  chapters.slice(1).forEach(({ el, chars, rest }) => {
    gsap.set(el, { autoAlpha: 0 });
    gsap.set(chars, { yPercent: 110 });
    gsap.set(rest, { autoAlpha: 0 });
  });

  const tl = buildTimeline(chapters);
  document.getElementById('track').style.height = `${Math.round(tl.duration() * 55)}vh`;

  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.08 });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const st = ScrollTrigger.create({
    trigger: '#track',
    start: 'top top',
    end: 'bottom bottom',
    animation: tl,
    scrub: reducedMotion ? true : 0.8,
  });
  if (import.meta.env.DEV) window.__tl = tl;

  // land a little after the chapter's label so its title has already slid in
  document.querySelectorAll('[data-goto]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const label = `ch${a.dataset.goto}`;
      const time = a.dataset.goto === '0' ? 0 : tl.labels[label] + 0.5;
      const top = st.start + (st.end - st.start) * (time / tl.duration());
      if (lenis) lenis.scrollTo(top, { duration: 2.4 });
      else scrollTo({ top });
    })
  );

  addEventListener('resize', renderer.resize);
  addEventListener('pointermove', (e) => {
    view.mouse[0] = (e.clientX - innerWidth / 2) / innerHeight;
    view.mouse[1] = (innerHeight / 2 - e.clientY) / innerHeight;
  });

  renderer.start();
  intro(chapters[0]);
  updateChrome(tl);
}

function buildTimeline(chapters) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: () => updateChrome(tl) });
  const progress = (i, at, duration) => tl.to(view.progress, { [i]: 1, duration, ease: 'power1.inOut' }, at);

  const show = (i, at) => {
    const { el, chars, title, rest } = chapters[i];
    tl.addLabel(`ch${i}`, at);
    tl.set(el, { autoAlpha: 1 }, at);
    tl.fromTo(title, { x: '8vw' }, { x: 0, duration: 0.9, ease: 'expo.out', immediateRender: false }, at);
    tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: 0.6, stagger: 0.03, ease: 'expo.out', immediateRender: false }, at);
    tl.fromTo(rest, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out', immediateRender: false }, at + 0.2);
  };
  const hide = (i, at) => {
    const { el, chars, title, rest } = chapters[i];
    tl.to(title, { x: '-6vw', duration: 0.45, ease: 'power2.in' }, at);
    tl.to(chars, { yPercent: -110, duration: 0.35, stagger: 0.015, ease: 'power2.in' }, at);
    tl.to(rest, { autoAlpha: 0, y: -16, duration: 0.3, ease: 'power2.in' }, at);
    tl.set(el, { autoAlpha: 0 }, at + 0.5);
  };

  // first light opens up, then each scene wipes in, plays out under its text, and hands over
  tl.addLabel('ch0', 0);
  progress(0, 0, 1.0);
  hide(0, 0.9);
  const step = 3.2;
  for (let i = 1; i < SCENES; i++) {
    const t = 1.0 + (i - 1) * step;
    tl.to(view, { pos: i, duration: 1.2, ease: 'power2.inOut' }, t);
    show(i, t + 0.75);
    progress(i, t + 1.2, 2.0);
    if (i < SCENES - 1) hide(i, t + step - 0.35);
  }
  tl.to({}, { duration: 0.8 });
  return tl;
}

let current = -1;
function updateChrome(tl) {
  const i = Number((tl.currentLabel() || 'ch0').slice(2));
  if (i === current) return;
  current = i;
  countEl.textContent = String(Math.min(i, SCENES - 2)).padStart(2, '0');
  navLinks.forEach((a) => a.setAttribute('aria-current', String(Number(a.dataset.goto) === i)));
}

function intro({ chars, rest }) {
  if (reducedMotion) return;
  gsap
    .timeline()
    .from(canvas, { opacity: 0, duration: 2.2, ease: 'power2.inOut' })
    .from(chars, { yPercent: 110, duration: 1.4, stagger: 0.04, ease: 'expo.out' }, 0.5)
    .from(rest, { autoAlpha: 0, y: 20, duration: 1, stagger: 0.1, ease: 'power3.out' }, 1.0)
    .from('.top, .index', { autoAlpha: 0, duration: 1 }, 1.2);
}
