const WHATSAPP_NUMBER = '522711026999';

export const whatsappLink = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

export const PHONE_LABEL = '271 102 6999';
export const ADDRESS = 'Av. 11 esq. Calle 26, No. 2601';

export const LINKS = {
  book: whatsappLink('Hola, quiero apartar una fecha en Playzone Córdoba.'),
  presale: whatsappLink('Hola, quiero información de la preventa de Playzone Córdoba.'),
  hours: whatsappLink('Hola, ¿cuáles son los horarios de Playzone Córdoba?'),
  map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Playzone ${ADDRESS}, Córdoba, Veracruz`)}`,
};

export const NAV = [
  { label: 'Atracciones', href: '#atracciones' },
  { label: 'Fiestas', href: '#fiestas' },
  { label: 'Recompensas', href: '#recompensas' },
  { label: 'Ubicación', href: '#ubicacion' },
];

/** Stops of the 3D tour, in visiting order. Camera poses live in scripts/park/tour.ts, same order. */
export const STOPS = [
  { title: 'Tirolesa', text: 'Agárrate fuerte y cruza por los aires.', tone: 'red', side: 'left' },
  { title: 'Puente de cuerdas', text: 'Pasa tabla por tabla sin perder el equilibrio.', tone: 'yellow', side: 'left' },
  { title: 'Pelotas acuáticas', text: 'Métete a la esfera y camina sobre el agua.', tone: 'blue', side: 'right' },
  { title: 'Lanchitas', text: 'Toma el volante y navega por la alberca.', tone: 'green', side: 'top' },
  { title: 'Muro de escalar', text: 'Sube presa por presa hasta la cima.', tone: 'red', side: 'right' },
  { title: 'Cancha de juegos', text: 'Arma tu equipo y a meter gol.', tone: 'green', side: 'right' },
] as const;

export const REWARD_TIERS = [
  { name: 'Fan', percent: 10, tone: 'green' },
  { name: 'Fanático', percent: 20, tone: 'blue' },
  { name: 'Súper Fanático', percent: 35, tone: 'red' },
] as const;
