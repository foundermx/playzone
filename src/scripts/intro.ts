import { parkScroll } from './park/journey.ts';

/**
 * First act of the park section: the hero zooms into the shop door and fades into the 3D park
 * waiting behind it. Writes the zoom as custom properties on the intro; Hero.astro draws it.
 */
const section = document.querySelector<HTMLElement>('[data-park]');
const intro = section?.querySelector<HTMLElement>('[data-intro]');
const art = intro?.querySelector<HTMLElement>('[data-door]');

if (section && intro && art && section.classList.contains('is-live')) {
  const scroll = parkScroll(section);
  // The glass front in the hero image: centre and size as fractions of the image.
  const [doorX, doorY, doorWidth, doorHeight] = art.dataset.door!.split(' ').map(Number);
  let maxZoom = 12;
  /** How fast the door may slide to the middle per unit of zoom; see measure(). */
  let slide = 1;

  const measure = () => {
    // Layout boxes, not getBoundingClientRect: the art is already zoomed.
    let x = art.offsetLeft;
    let y = art.offsetTop;
    for (let node = art.offsetParent as HTMLElement | null; node && node !== intro; node = node.offsetParent as HTMLElement | null) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    const width = art.offsetWidth;
    const height = art.offsetHeight;
    const header = parseFloat(getComputedStyle(intro).paddingTop);
    const view = innerHeight - header;
    const door = { x: x + doorX * width, y: y + doorY * height };

    // The door travels to the middle of what is visible under the header...
    const toX = intro.clientWidth / 2 - door.x;
    const toY = header + view / 2 - door.y;
    intro.style.setProperty('--to-x', `${toX}px`);
    intro.style.setProperty('--to-y', `${toY}px`);
    // ...and grows until the glass overfills the screen.
    maxZoom = 1.15 * Math.max(intro.clientWidth / (doorWidth * width), view / (doorHeight * height));

    // Sliding pulls the far edges of the image inward while zooming pushes them out. An edge at
    // distance d from the door stays put if slide <= d * (zoom - 1) / travel, so the slide is held
    // to the tightest edge and the background behind the image never shows.
    const edge = (distance: number, travel: number) => (Math.abs(travel) < 1 ? Infinity : distance / Math.abs(travel));
    slide = Math.min(
      edge(toX < 0 ? x + width - door.x : door.x - x, toX),
      edge(toY < 0 ? y + height - door.y : door.y - y, toY),
    );
  };

  let queued = false;
  const update = () => {
    queued = false;
    const p = scroll.progress().intro;
    intro.style.setProperty('--p', p.toFixed(4));
    // Exponential, so the dive reads as one steady push through the door.
    const zoom = maxZoom ** (p ** 1.3);
    intro.style.setProperty('--zoom', zoom.toFixed(4));
    // 1 - e^-x never outruns x: the door eases to the middle without uncovering an edge.
    intro.style.setProperty('--shift', (1 - Math.exp(-slide * (zoom - 1))).toFixed(4));
    intro.classList.toggle('is-leaving', p > 0.2);
    intro.classList.toggle('is-through', p > 0.999);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  const resize = new ResizeObserver(() => {
    measure();
    update();
  });
  resize.observe(intro);
  resize.observe(art);
  addEventListener('scroll', queue, { passive: true });
  measure();
  update();
}
