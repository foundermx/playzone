const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The park section is read in two acts: first the hero zooms through the shop door (`intro`),
 * then the camera visits the stops (`tour`). The act changes at the [data-tour-start] marker,
 * which CSS places --intro-travel down the section. No three.js here: the hero loads this too.
 */
export function parkScroll(section: HTMLElement) {
  const stage = section.querySelector<HTMLElement>('.stage')!;
  const marker = section.querySelector<HTMLElement>('[data-tour-start]')!;

  // getBoundingClientRect first: it settles layout, so the offset reads after it are free.
  const measure = () => {
    const top = section.getBoundingClientRect().top;
    const introTravel = marker.offsetTop;
    return { top, introTravel, tourTravel: section.offsetHeight - stage.offsetHeight - introTravel };
  };

  return {
    /** Both acts as 0..1. */
    progress() {
      const { top, introTravel, tourTravel } = measure();
      return { intro: clamp01(-top / introTravel), tour: clamp01((-top - introTravel) / tourTravel) };
    },
    /** Page scroll position at which the tour reaches `tour` (0..1). */
    scrollFor(tour: number) {
      const { top, introTravel, tourTravel } = measure();
      return top + scrollY + introTravel + tourTravel * tour;
    },
  };
}
