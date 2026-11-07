/**
 * Writes --p (0..1) on every [data-scroll-progress] element, from when its top reaches
 * data-start to when it reaches data-end (fractions of the viewport height). CSS does the
 * rest. Plain JS and not animation-timeline because Firefox still ships it behind a flag.
 *
 * Measured elements must not move with their own --p (that feeds back): animate a child.
 */
const targets = [...document.querySelectorAll<HTMLElement>('[data-scroll-progress]')];
const ranges = targets.map((element) => [Number(element.dataset.start), Number(element.dataset.end)]);
const written = targets.map(() => '');

let queued = false;

function update() {
  queued = false;
  const height = innerHeight;
  // Every read first, then every write: one layout per frame however many elements there are.
  const tops = targets.map((element) => element.getBoundingClientRect().top);
  targets.forEach((element, i) => {
    const start = height * ranges[i][0];
    const end = height * ranges[i][1];
    const value = Math.min(1, Math.max(0, (start - tops[i]) / (start - end))).toFixed(3);
    if (value === written[i]) return;
    written[i] = value;
    element.style.setProperty('--p', value);
  });
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(update);
}

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  update();
}
