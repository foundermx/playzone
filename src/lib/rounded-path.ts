/** A vertex of an outline: [x, y] or [x, y, radius] to override the default radius. */
export type Vertex = [number, number, number?];

const towards = (from: Vertex, to: Vertex, distance: number) => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const t = distance / length;
  return `${from[0] + (to[0] - from[0]) * t} ${from[1] + (to[1] - from[1]) * t}`;
};

/** SVG path for a closed polygon with rounded corners, convex or concave. */
export function roundedPath(points: Vertex[], radius: number): string {
  const count = points.length;
  const corners = points.map((point, i) => {
    const previous = points[(i + count - 1) % count];
    const next = points[(i + 1) % count];
    const shortest = Math.min(
      Math.hypot(point[0] - previous[0], point[1] - previous[1]),
      Math.hypot(point[0] - next[0], point[1] - next[1]),
    );
    const r = Math.min(point[2] ?? radius, shortest / 2);
    const command = i === 0 ? 'M' : 'L';
    return `${command}${towards(point, previous, r)} Q${point[0]} ${point[1]} ${towards(point, next, r)}`;
  });
  return `${corners.join(' ')} Z`;
}
