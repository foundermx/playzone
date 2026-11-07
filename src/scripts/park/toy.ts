import * as THREE from 'three';
import { COLOR, GROUND_Y, HALL, LIGHT_VOLUME, MATS, OUTLINE, PADDING, SUN } from './layout.ts';

const glslVec3 = (hex: number) => {
  const { r, g, b } = new THREE.Color(hex);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
};

/** The air of the hall: far walls and floor soften towards it. */
const HAZE = 0xc4d3e3;
/** Behind everything: the dark of the hall's ceiling. */
export const BACKDROP = COLOR.ceiling;

/**
 * Every surface of the park shares this shading. All the expensive light (sky, lamps,
 * soft shadows, colour bounced between bricks) was baked into a small 3D texture, so a
 * pixel costs one texture read plus a few lines of maths. That is what keeps it smooth.
 */
const LIGHTING = /* glsl */ `
  uniform highp sampler3D uLight;
  uniform vec3 uLightMin;
  uniform vec3 uLightMax;
  uniform vec3 uLightInvSize;

  const vec3 SUN_DIR = vec3(${SUN.join(', ')});
  const vec3 SUN_RGB = vec3(1.12, 1.0, 0.84);
  // What the bake measured in open air: the light out in the hall, past the volume.
  const vec4 OPEN_LIGHT = vec4(0.64, 0.72, 0.84, 1.0);

  uniform vec3 uHaze;
  uniform float uFocus;

  // Air between the camera and what lies well behind its subject. \`clear\` keeps it off nearer things.
  vec3 haze(vec3 colour, vec3 world, float clear) {
    float far = max(distance(cameraPosition, world) - uFocus * 0.85 - clear, 0.0) / (uFocus * 1.4 + 20.0);
    return mix(colour, uHaze, 1.0 - exp(-far * far));
  }

  // What a glossy toy reflects: a bright studio ceiling and one long softbox.
  vec3 studio(vec3 r) {
    vec3 room = mix(vec3(0.26, 0.34, 0.5), vec3(0.95, 1.0, 1.08), smoothstep(-0.2, 0.75, r.y));
    float softbox = smoothstep(0.8, 0.9, dot(r, normalize(vec3(-0.3, 0.86, 0.42))));
    float strip = smoothstep(0.93, 0.975, dot(r, normalize(vec3(0.72, 0.42, 0.55))));
    return room + softbox * 1.9 + strip * 0.8;
  }

  vec4 bakedLight(vec3 world, vec3 n) {
    vec3 at = world + n * 0.42;
    vec4 light = texture(uLight, (at - uLightMin) * uLightInvSize);
    light.rgb = light.rgb * light.rgb * 1.6;
    // The texture clamps at its edges; out there nothing stands in the way of the light.
    vec3 outside = max(max(uLightMin - at, at - uLightMax), 0.0);
    return mix(light, OPEN_LIGHT, clamp(length(outside) / 2.5, 0.0, 1.0));
  }

  vec3 shade(vec3 albedo, float gloss, vec3 n, vec3 world) {
    vec3 view = normalize(cameraPosition - world);
    vec4 light = bakedLight(world, n);

    // Moulded plastic lets light creep past the terminator: wrap instead of a hard edge.
    float wrap = clamp((dot(n, SUN_DIR) + 0.22) / 1.22, 0.0, 1.0);
    vec3 colour = albedo * (light.rgb * (0.8 + 0.3 * n.y) + SUN_RGB * wrap * light.a * 0.74);

    vec3 towards = normalize(SUN_DIR + view);
    float facing = max(dot(n, towards), 0.0);
    float highlight = (pow(facing, 160.0) * 1.2 + pow(facing, 26.0) * 0.08) * light.a;
    float fresnel = 0.045 + 0.955 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    float open = clamp(dot(light.rgb, vec3(0.42)), 0.12, 1.0);
    colour += gloss * (SUN_RGB * highlight + studio(reflect(-view, n)) * fresnel * open);
    float grey = dot(colour, vec3(0.3, 0.59, 0.11));
    return mix(vec3(grey), colour, 1.14);
  }
`;

const SURFACE_FRAGMENT = /* glsl */ `
  ${LIGHTING}
  varying vec4 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vSeam;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 colour = shade(vColor.rgb, vColor.a, n, vWorld);
    // Bevels that do not face up fall into the gap between bricks: that is the seam you see.
    colour *= 1.0 - vSeam * (1.0 - max(n.y, 0.0));
    gl_FragColor = vec4(haze(colour, vWorld, 25.0), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Bricks and props fall from above as uBuilt goes from 0 to 1. */
const RAIN = /* glsl */ `
  uniform float uBuilt;
  uniform float uTime;
  varying vec4 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vSeam;

  vec3 fall(vec3 world, vec3 anchor, float delay) {
    float t = clamp((uBuilt - delay) / 0.14, 0.0, 1.0);
    float rest = 1.0 - t;
    world = t > 0.0 ? world : anchor;
    world.y += rest * rest * rest * 16.0;
    return world;
  }
`;

/** One unit box for every brick: size comes per instance, so the bevel never stretches. */
const BRICK_VERTEX = /* glsl */ `
  ${RAIN}
  attribute vec3 iCentre;
  attribute vec3 iSize;
  attribute vec4 iColor;
  attribute vec2 iMeta;

  void main() {
    float radius = min(0.11, min(iSize.y, min(iSize.x, iSize.z)) * 0.24);
    vec3 extent = iSize * 0.5 - 0.018;
    vec3 local = sign(position) * (extent - radius) + normal * radius;
    float c = cos(iMeta.x);
    float s = sin(iMeta.x);
    vec3 turned = vec3(c * local.x + s * local.z, local.y, c * local.z - s * local.x);
    vNormal = vec3(c * normal.x + s * normal.z, normal.y, c * normal.z - s * normal.x);
    vColor = iColor;
    vSeam = (1.0 - max(abs(normal.x), max(abs(normal.y), abs(normal.z)))) * 2.1;
    vWorld = fall(iCentre + turned, iCentre, iMeta.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

/** Round things repeated many times: studs and floating balls. */
const STUD_VERTEX = /* glsl */ `
  ${RAIN}
  attribute float aShade;
  attribute vec3 iCentre;
  attribute vec4 iColor;
  attribute vec4 iMeta;

  void main() {
    // iMeta: delay, 1 to point the stud at +Z, bob height, scale.
    vec3 local = position * iMeta.w;
    vec3 n = normal;
    if (iMeta.y > 0.5) {
      local = vec3(local.x, -local.z, local.y);
      n = vec3(n.x, -n.z, n.y);
    }
    vec3 world = iCentre + local;
    world.y += iMeta.z * sin(uTime * 1.3 + iCentre.x * 2.1 + iCentre.z * 1.7);
    vNormal = n;
    vColor = vec4(iColor.rgb * aShade, iColor.a);
    vSeam = 0.0;
    vWorld = fall(world, iCentre, iMeta.x);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const MESH_VERTEX = /* glsl */ `
  ${RAIN}
  attribute vec4 aColor;
  attribute float aDelay;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vColor = aColor;
    vSeam = 0.0;
    vWorld = fall(world.xyz, modelMatrix[3].xyz, aDelay);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  ${LIGHTING}
  uniform float uTime;
  varying vec3 vWorld;

  float ripple(vec2 p, float t) {
    return sin(p.x * 1.7 + t) + sin(p.y * 2.1 - t * 1.3)
      + sin((p.x + p.y) * 1.1 + t * 0.7) + 0.5 * sin((p.x - p.y) * 2.9 - t * 1.1);
  }

  // Domain-warped interference: the bright web that light draws on a pool floor.
  float caustics(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 3; n++) {
      float s = t * (1.0 - 3.5 / float(n + 1));
      i = p + vec2(cos(s - i.x) + sin(s + i.y), sin(s - i.y) + cos(s + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + s) / 0.005), p.y / (cos(i.y + s) / 0.005)));
    }
    c = 1.17 - pow(c / 3.0, 1.4);
    return pow(abs(c), 9.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    float e = 0.05;
    float h = ripple(p, t);
    vec3 n = normalize(vec3(
      (h - ripple(p + vec2(e, 0.0), t)) / e * 0.03,
      1.0,
      (h - ripple(p + vec2(0.0, e), t)) / e * 0.03
    ));

    vec4 light = bakedLight(vWorld, vec3(0.0, 1.0, 0.0));
    vec3 lit = light.rgb * 0.92 + SUN_RGB * light.a * 0.6;

    // Pool floor seen through the surface: mosaic, bent by the ripples.
    vec2 tile = abs(fract((p + n.xz * 2.4) * 0.5) - 0.5);
    float grout = smoothstep(0.455, 0.49, max(tile.x, tile.y));
    vec3 pool = mix(vec3(0.0, 0.26, 0.5), vec3(0.0, 0.5, 0.72), 0.5 + 0.5 * sin(p.x * 0.31 + p.y * 0.23));
    pool += grout * vec3(0.05, 0.11, 0.12);

    vec3 colour = pool * lit;
    colour += caustics(mod(p * 0.8, 6.2831853) - 250.0, t * 0.5) * vec3(0.5, 0.86, 0.95) * lit * 0.85;

    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    // Under the deck there is no bright ceiling to mirror: reflections fade with the light.
    float open = clamp(dot(light.rgb, vec3(0.42)) * 1.3 - 0.1, 0.0, 1.0);
    colour = mix(colour, studio(reflect(-view, n)) * vec3(0.8, 0.95, 1.0), fresnel * 0.62 * open);
    float glint = pow(max(dot(normalize(SUN_DIR + view), n), 0.0), 420.0);
    colour += glint * 1.5 * light.a;

    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

const ZORB_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;

  void main() {
    vLocal = normalize(position);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ZORB_FRAGMENT = /* glsl */ `
  ${LIGHTING}
  uniform float uZip;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;

  vec3 hash(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }

  // Distance to the edge between neighbouring cells: the welded panels of the ball.
  float panels(vec3 p) {
    vec3 base = floor(p);
    float first = 8.0;
    float second = 8.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 cell = base + vec3(float(x), float(y), float(z));
          float d = length(cell + hash(cell) - p);
          if (d < first) { second = first; first = d; }
          else if (d < second) { second = d; }
        }
      }
    }
    return second - first;
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    float facing = abs(dot(n, view));
    float rim = pow(1.0 - facing, 1.9);
    vec3 mirrored = studio(reflect(-view, n));
    float bright = max(max(mirrored.r, mirrored.g), mirrored.b);

    // Thin clear plastic: nearly invisible face-on, a bright milky edge, a sharp softbox.
    vec3 colour = mix(vec3(0.82, 0.93, 1.0), mirrored, 0.5) * (0.75 + 0.5 * rim);
    float alpha = 0.07 + rim * 0.74 + smoothstep(1.5, 2.6, bright) * 0.42;

    float seam = 1.0 - smoothstep(0.0, 0.05, panels(vLocal * 2.15 + 7.0));
    colour = mix(colour, vec3(1.0), seam * 0.85);
    alpha = max(alpha, seam * 0.5);

    float glint = pow(max(dot(normalize(SUN_DIR + view), n), 0.0), 900.0);
    colour += glint * 3.0;
    alpha = max(alpha, glint);

    // The zip: a dark arc on the side facing the visitors.
    vec3 plane = normalize(vec3(0.82, -0.27, 0.5));
    vec3 middle = normalize(vec3(-0.18, 0.69, 0.68));
    float offCentre = abs(dot(vLocal, plane));
    float along = dot(vLocal, middle);
    float width = fwidth(offCentre);
    float band = (1.0 - smoothstep(0.034, 0.034 + width * 1.5, offCentre)) * smoothstep(0.62, 0.64, along) * uZip;
    colour = mix(colour, vec3(0.012, 0.012, 0.018) + rim * 0.2, band);
    alpha = mix(alpha, 1.0, band);

    gl_FragColor = vec4(colour, alpha);
    #include <colorspace_fragment>
  }
`;

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform float uBuilt;
  varying vec2 vUv;

  void main() {
    float d = length(vUv);
    float core = 1.0 - smoothstep(0.12, 0.17, d);
    float halo = pow(max(1.0 - d, 0.0), 2.6) * 0.42;
    vec3 colour = vec3(1.0, 0.9, 0.68) * core + vec3(1.0, 0.72, 0.4) * halo;
    gl_FragColor = vec4(colour * smoothstep(0.9, 1.0, uBuilt), 1.0);
    #include <colorspace_fragment>
  }
`;

const BLOB_VERTEX = /* glsl */ `
  attribute float iOpacity;
  varying vec2 vUv;
  varying float vOpacity;

  void main() {
    vUv = uv * 2.0 - 1.0;
    vOpacity = iOpacity;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const BLOB_FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  varying vec2 vUv;
  varying float vOpacity;

  void main() {
    float d = length(vUv);
    float soft = 1.0 - smoothstep(0.1, 1.0, d);
    gl_FragColor = vec4(uTint, soft * soft * vOpacity);
    #include <colorspace_fragment>
  }
`;

const FLOOR_VERTEX = /* glsl */ `
  varying vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;


/**
 * The hall floor, drawn per pixel: a ring of jigsaw foam mats around the park, then polished
 * tiles that mirror the light panels of the ceiling, which is what makes it read as indoors.
 */
const FLOOR_FRAGMENT = /* glsl */ `
  ${LIGHTING}
  varying vec3 vWorld;

  const vec2 OUTLINE[${OUTLINE.length}] = vec2[${OUTLINE.length}](${OUTLINE.map(([x, z]) => `vec2(${x.toFixed(2)}, ${z.toFixed(2)})`).join(', ')});
  const float MATS = ${MATS.toFixed(2)};
  const vec3 FLOOR = ${glslVec3(COLOR.floor)};
  const vec3 MAT_COLOURS[4] = vec3[4](${[0xd9605a, 0xeebc4a, 0x4a7fcf, 0x55a865].map(glslVec3).join(', ')});
  const float CEILING = ${HALL.ceiling.toFixed(1)};
  const float LAMP_PITCH = ${HALL.lightPitch.toFixed(1)};
  const float LAMP_RADIUS = ${HALL.lightRadius.toFixed(2)};
  const vec2 WALLS = vec2(${HALL.x0.toFixed(1)}, ${HALL.x1.toFixed(1)});
  const float BACK = ${HALL.z0.toFixed(1)};
  const float FLOOR_Y = ${GROUND_Y.toFixed(2)};
  const vec3 PADS[4] = vec3[4](${PADDING.map(glslVec3).join(', ')});
  const vec3 WALL = ${glslVec3(COLOR.wall)};
  const vec3 RAIL = ${glslVec3(COLOR.red)};
  const vec3 ROOF = ${glslVec3(COLOR.ceiling)};
  const vec3 UP = vec3(0.0, 1.0, 0.0);

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Signed distance to the park's outline (negative inside).
  float outline(vec2 p) {
    float d = dot(p - OUTLINE[0], p - OUTLINE[0]);
    float s = 1.0;
    for (int i = 0, j = ${OUTLINE.length - 1}; i < ${OUTLINE.length}; j = i, i++) {
      vec2 e = OUTLINE[j] - OUTLINE[i];
      vec2 w = p - OUTLINE[i];
      vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
      d = min(d, dot(b, b));
      bvec3 c = bvec3(p.y >= OUTLINE[i].y, p.y < OUTLINE[j].y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s = -s;
    }
    return s * sqrt(d);
  }

  // Distance to the nearest line of a square grid, in world units.
  float gridLine(vec2 p, float size) {
    vec2 q = abs(fract(p / size + 0.5) - 0.5) * size;
    return min(q.x, q.y);
  }

  // How much of the pixel's reflection lands on a round ceiling light, filtered by its footprint.
  float lamps(vec2 hit) {
    vec2 local = mod(hit + LAMP_PITCH * 0.5, LAMP_PITCH) - LAMP_PITCH * 0.5;
    float blur = max(length(fwidth(hit)), 1e-3);
    float inside = clamp((LAMP_RADIUS - length(local)) / blur + 0.5, 0.0, 1.0);
    float average = 3.14159 * LAMP_RADIUS * LAMP_RADIUS / (LAMP_PITCH * LAMP_PITCH);
    return mix(inside, average, smoothstep(0.6, 3.0, blur));
  }

  // What a ray off the polished floor meets first: a wall, padded in colours along its foot,
  // or the dark ceiling and its lights. Softer the further it travels, as on a real floor.
  vec3 mirrored(vec3 from, vec3 r) {
    float never = 1e5;
    float back = r.z < 0.0 ? (BACK - from.z) / r.z : never;
    float side = min(r.x < 0.0 ? (WALLS.x - from.x) / r.x : never, r.x > 0.0 ? (WALLS.y - from.x) / r.x : never);
    float roof = (CEILING - from.y) / max(r.y, 1e-3);
    float t = min(min(back, side), roof);
    vec3 hit = from + r * t;
    vec3 above = mix(ROOF * 1.4, vec3(1.0, 0.96, 0.88) * 1.3, lamps(hit.xz));

    bool onBack = back < side;
    float pad = onBack ? floor((hit.x - WALLS.x) / 6.0) : floor((hit.z - BACK) / 6.0) + (r.x < 0.0 ? 1.0 : 3.0);
    float h = hit.y - FLOOR_Y;
    float soft = 0.15 + t * 0.015;
    vec3 wall = mix(PADS[int(mod(pad, 4.0))] * 1.05, RAIL, smoothstep(6.4 - soft, 6.4 + soft, h));
    wall = mix(wall, WALL * 1.15, smoothstep(8.4 - soft, 8.4 + soft, h));
    return roof < min(back, side) ? above : wall;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = max(length(fwidth(p)), 1e-4);
    float edge = outline(p);

    vec3 albedo;
    float gloss;
    float mirror;
    float occlusion = 1.0;

    if (edge < MATS) {
      // Interlocking foam mats, two studs a side, the joins cut as jigsaw tabs.
      vec2 tabs = vec2(sin(p.y * 4.712), sin(p.x * 4.712));
      vec2 q = p + 0.13 * vec2(smoothstep(-0.3, 0.3, tabs.x) * 2.0 - 1.0, smoothstep(-0.3, 0.3, tabs.y) * 2.0 - 1.0);
      vec2 mat = floor(q * 0.5);
      int pick = int(mod(mat.x + mat.y * 2.0, 4.0));
      albedo = MAT_COLOURS[pick] * (0.94 + 0.08 * hash(floor(p * 9.0)));
      // Foam is soft and a little chalky: keep it from shouting over the bricks.
      albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), 0.25) * 0.92;
      float join = 1.0 - smoothstep(0.03, 0.03 + pixel, gridLine(q, 2.0));
      albedo *= 1.0 - 0.45 * join;
      gloss = 0.05;
      mirror = 0.0;
    } else {
      // Polished floor in big tiles, darker where it meets the walls.
      vec2 tile = floor(p / 4.0);
      albedo = FLOOR * (0.97 + 0.05 * hash(tile));
      float groove = 1.0 - smoothstep(0.025, 0.025 + pixel, gridLine(p, 4.0));
      albedo *= 1.0 - 0.18 * groove;
      // The mats stand a little proud of the floor: a soft shadow along their edge.
      occlusion *= 1.0 - 0.3 * exp(-(edge - MATS) * 5.0);
      float toWall = min(min(p.x - WALLS.x, WALLS.y - p.x), p.y - BACK);
      occlusion *= 1.0 - 0.35 * exp(-max(toWall, 0.0) * 0.5);
      gloss = 0.12;
      mirror = 1.0;
    }

    // Contact shadow where the park meets the floor.
    occlusion *= 1.0 - 0.4 * exp(-max(edge, 0.0) * 1.3);

    vec3 colour = shade(albedo, gloss, UP, vWorld) * occlusion;

    // Outside any branch: the light filtering needs screen-space derivatives.
    float fresnel = 0.04 + 0.96 * pow(1.0 - max(view.y, 0.0), 5.0);
    vec3 seen = mirrored(vWorld, reflect(-view, UP));
    colour = mix(colour, seen, mirror * (0.07 + 0.6 * fresnel));

    gl_FragColor = vec4(haze(colour, vWorld, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Lights in the ceiling: flat glowing panels, unaffected by anything. */
const LAMP_FRAGMENT = /* glsl */ `
  void main() {
    gl_FragColor = vec4(1.0, 0.97, 0.9, 1.0);
    #include <colorspace_fragment>
  }
`;

const LAMP_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function placeholderLight() {
  const texture = new THREE.Data3DTexture(new Uint8Array([190, 195, 205, 200]), 1, 1, 1);
  texture.needsUpdate = true;
  return texture;
}

const { min, max } = LIGHT_VOLUME;

/** Shared by every material, so one write reaches the whole scene. */
export const shared = {
  uLight: { value: placeholderLight() as THREE.Data3DTexture },
  uLightMin: { value: new THREE.Vector3(...min) },
  uLightMax: { value: new THREE.Vector3(...max) },
  uLightInvSize: { value: new THREE.Vector3(1 / (max[0] - min[0]), 1 / (max[1] - min[1]), 1 / (max[2] - min[2])) },
  uBuilt: { value: 0 },
  uTime: { value: 0 },
  uHaze: { value: new THREE.Color(HAZE) },
  /** Distance to what the camera looks at: the world hazes over from a little past it. */
  uFocus: { value: 80 },
};

export function createMaterials() {
  const surface = (vertexShader: string) => new THREE.ShaderMaterial({ vertexShader, fragmentShader: SURFACE_FRAGMENT, uniforms: shared });
  const zorb = (zipped: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: ZORB_VERTEX,
      fragmentShader: ZORB_FRAGMENT,
      uniforms: { ...shared, uZip: { value: zipped ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
    });
  return {
    brick: surface(BRICK_VERTEX),
    stud: surface(STUD_VERTEX),
    mesh: surface(MESH_VERTEX),
    water: new THREE.ShaderMaterial({ vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT, uniforms: shared }),
    zorb,
    glow: new THREE.ShaderMaterial({
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      uniforms: shared,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    blob: new THREE.ShaderMaterial({
      vertexShader: BLOB_VERTEX,
      fragmentShader: BLOB_FRAGMENT,
      uniforms: { uTint: { value: new THREE.Color(0x0a2a6a) } },
      transparent: true,
      depthWrite: false,
    }),
    floor: new THREE.ShaderMaterial({ vertexShader: FLOOR_VERTEX, fragmentShader: FLOOR_FRAGMENT, uniforms: shared }),
    lamp: new THREE.ShaderMaterial({ vertexShader: LAMP_VERTEX, fragmentShader: LAMP_FRAGMENT }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;

/** Loads the baked light. Until it lands the park simply shows flat ambient light. */
export async function loadLight(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Light volume unavailable: ${response.status}`);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  const { voxel } = LIGHT_VOLUME;
  const size = [0, 1, 2].map((axis) => Math.round((max[axis] - min[axis]) / voxel));
  const texture = new THREE.Data3DTexture(data, size[0], size[1], size[2]);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  shared.uLight.value = texture;
}
