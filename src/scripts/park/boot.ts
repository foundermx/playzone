const section = document.querySelector<HTMLElement>('[data-park]');

// ParkTour turns the section live before the first paint when motion and WebGL2 are available.
if (section?.classList.contains('is-live')) {
  const mount = async () => {
    try {
      const { mountPark } = await import('./stage.ts');
      await mountPark(section);
    } catch (error) {
      // Scene failed to start: fall back to the static hero and poster instead of a long empty section.
      section.classList.remove('is-live');
      console.error(error);
    }
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    mount();
  };

  // The hero covers the scene at the top of the page, so nothing needs it before the first scroll
  // (which also fires when a reload restores a position halfway down).
  addEventListener('scroll', start, { once: true, passive: true });
  if (scrollY > 0) start();

  if (matchMedia('(pointer: fine)').matches) {
    // Desktops fetch it once the hero is done and the browser has nothing better to do, so the
    // park is already standing behind the door when the zoom gets there.
    addEventListener('load', () => {
      const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 400));
      setTimeout(() => idle(start, { timeout: 1500 }), 1400);
    }, { once: true });
  }
}
