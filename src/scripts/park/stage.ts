import * as THREE from 'three';
import { breathe, clamp01 } from './kit.ts';
import { buildPark } from './park.ts';
import { loadLight } from './toy.ts';
import { LEGS, poseAt, stopAt } from './tour.ts';

const FOV = 26;
/** Pixels worth shading: past this a sharper canvas costs more than it shows. */
const PIXEL_BUDGET = 3_400_000;

/** Scene plus the render loop that follows the scroll position. */
export async function mountPark(section: HTMLElement) {
  const stage = section.querySelector<HTMLElement>('.stage')!;
  const canvas = section.querySelector('canvas')!;
  const cards = [...section.querySelectorAll<HTMLElement>('[data-stop]')];
  const dots = [...section.querySelectorAll<HTMLButtonElement>('[data-go]')];
  const coarse = matchMedia('(pointer: coarse)').matches;

  const scene = new THREE.Scene();
  const park = await buildPark(coarse ? 14 : 24);
  scene.add(park.root);
  await breathe();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0xd4eefd, 1);
  await breathe();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 260);
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();

  let aspect = 1;
  let quality = 1;
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = stage;
    const ratio = Math.min(devicePixelRatio, Math.sqrt(PIXEL_BUDGET / (width * height))) * quality;
    aspect = width / height;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // setSize clears the canvas; repaint now or every resize flashes empty.
    renderer.render(scene, camera);
  };

  // Compile off the critical path where the browser allows it, so entering the section never hitches.
  await renderer.compileAsync(scene, camera);
  new ResizeObserver(resize).observe(stage);
  loadLight(`${import.meta.env.BASE_URL}park-light.dat`).catch(console.error);

  const scrollTravel = () => section.offsetHeight - stage.offsetHeight;
  const goTo = (stop: number) => {
    const top = section.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + scrollTravel() * ((stop + 1) / LEGS), behavior: 'smooth' });
  };
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  let activeStop = -2;
  const showStop = (stop: number) => {
    if (stop === activeStop) return;
    activeStop = stop;
    cards.forEach((card, i) => card.classList.toggle('is-active', i === stop));
    dots.forEach((dot, i) => {
      if (i === stop) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
  };

  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  if (!coarse) {
    addEventListener('pointermove', (event) => {
      pointer.x = event.clientX / innerWidth - 0.5;
      pointer.y = event.clientY / innerHeight - 0.5;
    }, { passive: true });
  }

  let progress = -1;
  let last = performance.now();
  let frameTime = 16.7;
  let framesSinceChange = 0;

  const frame = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.1);
    frameTime += (delta * 1000 - frameTime) * 0.05;
    last = now;

    const top = section.getBoundingClientRect().top;
    const wanted = clamp01(-top / scrollTravel());
    progress = progress < 0 ? wanted : progress + (wanted - progress) * (1 - Math.exp(-delta * 9));

    // Bricks rain in while the stage slides up into view.
    park.setBuilt(clamp01(1.08 - top / (innerHeight * 0.92)));
    park.update(now / 1000, progress);

    poseAt(progress, aspect, position, target);
    pointer.smoothX += (pointer.x - pointer.smoothX) * (1 - Math.exp(-delta * 3));
    pointer.smoothY += (pointer.y - pointer.smoothY) * (1 - Math.exp(-delta * 3));
    camera.position.copy(position);
    camera.lookAt(target);
    camera.translateX(pointer.smoothX * 1.4);
    camera.translateY(-pointer.smoothY * 0.9);
    camera.lookAt(target);

    showStop(stopAt(progress));
    section.classList.toggle('is-started', progress > 0.012);
    section.classList.toggle('is-touring', progress > 0.012 && progress < 0.99);
    section.classList.toggle('is-finished', progress > 0.975);
    renderer.render(scene, camera);

    // Trade sharpness for smoothness when the GPU cannot keep up, and take it back when it can.
    if (++framesSinceChange > 45) {
      if (frameTime > 21 && quality > 0.55) {
        quality = Math.max(0.55, quality - 0.15);
        framesSinceChange = 0;
        resize();
      } else if (frameTime < 17.5 && quality < 1 && framesSinceChange > 240) {
        quality = Math.min(1, quality + 0.15);
        framesSinceChange = 0;
        resize();
      }
    }
  };

  new IntersectionObserver(([entry]) => {
    last = performance.now();
    renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
  }, { rootMargin: '20% 0px' }).observe(stage);

  section.classList.add('is-ready');
}
