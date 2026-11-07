const section = document.querySelector<HTMLElement>('[data-park]');

if (section && !matchMedia('(prefers-reduced-motion: reduce)').matches && 'WebGL2RenderingContext' in window) {
  // The section grows now, not when the scene arrives, so nothing jumps under the reader.
  section.classList.add('is-live');

  const mount = async () => {
    try {
      const { mountPark } = await import('./stage.ts');
      await mountPark(section);
    } catch (error) {
      // Scene failed to start: fall back to the poster instead of a long empty section.
      section.classList.remove('is-live');
      console.error(error);
    }
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    observer.disconnect();
    mount();
  };

  // A page reloaded halfway down needs the scene right away.
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) start();
  });
  observer.observe(section);

  if (matchMedia('(pointer: fine)').matches) {
    // Desktops fetch it once the hero is done and the browser has nothing better to do.
    addEventListener('load', () => {
      const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 400));
      setTimeout(() => idle(start, { timeout: 1500 }), 1400);
    }, { once: true });
  } else {
    // Phones wait for the first scroll: data and CPU go to what is on screen until then.
    addEventListener('scroll', start, { once: true, passive: true });
  }
}
