/**
 * Bricks marked [data-drop] fall into place (the brick-drop animation in global.css) when they
 * come into view. Once a brick has gone back below the screen it is picked up again, so it
 * falls anew on the way down. Without motion, they are simply there.
 */
const bricks = [...document.querySelectorAll<HTMLElement>('[data-drop]')];

if (bricks.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('can-drop');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting, boundingClientRect } of entries) {
        if (isIntersecting) target.classList.add('is-dropped');
        else if (boundingClientRect.top > innerHeight) target.classList.remove('is-dropped');
      }
    },
    // Falls once half of it is on screen, not the moment its edge shows. A share of the brick
    // and not a strip of the screen: bricks at the very end of the page must still get there.
    { threshold: 0.5 },
  );
  bricks.forEach((brick) => observer.observe(brick));
}
