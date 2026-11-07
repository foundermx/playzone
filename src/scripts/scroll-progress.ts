/**
 * Writes --p (0..1) on every [data-scroll-progress] element, from when its top reaches
 * data-start to when it reaches data-end (fractions of the viewport height). CSS does the
 * rest. Plain JS and not animation-timeline because Firefox still ships it behind a flag.
 */
const targets = [...document.querySelectorAll<HTMLElement>('[data-scroll-progress]')];

let queued = false;

function update() {
  queued = false;
  for (const element of targets) {
    const start = innerHeight * Number(element.dataset.start);
    const end = innerHeight * Number(element.dataset.end);
    const top = element.getBoundingClientRect().top;
    const progress = Math.min(1, Math.max(0, (start - top) / (start - end)));
    element.style.setProperty('--p', progress.toFixed(4));
    element.classList.toggle('is-done', progress === 1);
  }
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
