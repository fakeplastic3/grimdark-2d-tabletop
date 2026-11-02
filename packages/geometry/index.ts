import type { Circle, Point } from '../shared/types';

export const EPSILON = 1e-7;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const distance3D = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
export const baseDistance = (a: Circle, b: Circle): number => Math.max(0, distance(a, b) - a.radius - b.radius);
export const verticalDistance = (a: Point, b: Point): number => Math.abs((a.z ?? 0) - (b.z ?? 0));
export const circlesOverlap = (a: Circle, b: Circle): boolean => distance(a, b) < a.radius + b.radius - EPSILON && verticalDistance(a, b) < EPSILON;
export const engaged = (a: Circle, b: Circle): boolean => baseDistance(a, b) <= 2 + EPSILON && verticalDistance(a, b) <= 5 + EPSILON;
export const isFinitePoint = (p: Point): boolean => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.z === undefined || Number.isFinite(p.z));

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const cross = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && pointSegmentDistance(c, a, b) <= EPSILON) ||
    (Math.abs(abD) <= EPSILON && pointSegmentDistance(d, a, b) <= EPSILON) ||
    (Math.abs(cdA) <= EPSILON && pointSegmentDistance(a, c, d) <= EPSILON) ||
    (Math.abs(cdB) <= EPSILON && pointSegmentDistance(b, c, d) <= EPSILON);
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Includes polygon boundary; valid for simple convex or concave polygons. */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (pointSegmentDistance(p, a, b) <= EPSILON) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function circlePolygonIntersects(circle: Circle, polygon: Point[]): boolean {
  return pointInPolygon(circle, polygon) || polygon.some((p, i) => pointSegmentDistance(circle, p, polygon[(i + 1) % polygon.length]) <= circle.radius + EPSILON);
}

export function circleToPolygonDistance(circle: Circle, polygon: Point[]): number {
  if (pointInPolygon(circle, polygon)) return 0;
  return Math.max(0, Math.min(...polygon.map((p, i) => pointSegmentDistance(circle, p, polygon[(i + 1) % polygon.length]))) - circle.radius);
}

/** Continuous swept-circle collision, not sampled waypoints. Tangency is permitted. */
export function pathIntersectsPolygon(from: Point, to: Point, radius: number, polygon: Point[]): boolean {
  if (pointInPolygon(from, polygon) || pointInPolygon(to, polygon)) return true;
  return polygon.some((p, i) => segmentDistance(from, to, p, polygon[(i + 1) % polygon.length]) < radius - EPSILON || segmentsIntersect(from, to, p, polygon[(i + 1) % polygon.length]));
}

export function segmentIntersectsPolygon(a: Point, b: Point, polygon: Point[]): boolean {
  return pointInPolygon(a, polygon) || pointInPolygon(b, polygon) || polygon.some((p, i) => segmentsIntersect(a, b, p, polygon[(i + 1) % polygon.length]));
}

export function pathHitsCircle(from: Point, to: Point, radius: number, obstacle: Circle): boolean {
  return pointSegmentDistance(obstacle, from, to) < radius + obstacle.radius - EPSILON;
}

export function pathsCollide(aFrom: Circle, aTo: Point, bFrom: Circle, bTo: Point): boolean {
  const relativeFrom = { x: aFrom.x - bFrom.x, y: aFrom.y - bFrom.y };
  const relativeTo = { x: aTo.x - bTo.x, y: aTo.y - bTo.y };
  return pointSegmentDistance({ x: 0, y: 0 }, relativeFrom, relativeTo) < aFrom.radius + bFrom.radius - EPSILON;
}

/** Training geometry: local neighbour and whole-unit span; independent of rendering. */
export function coherent(models: Circle[]): boolean {
  if (models.length <= 1) return true;
  return models.every((model, i) => {
    const others = models.filter((_, j) => i !== j);
    return others.some(other => baseDistance(model, other) <= 2 + EPSILON && verticalDistance(model, other) <= 5 + EPSILON) &&
      others.every(other => baseDistance(model, other) <= 9 + EPSILON && verticalDistance(model, other) <= 5 + EPSILON);
  });
}

export function inBounds(circle: Circle, width: number, height: number): boolean {
  return circle.x - circle.radius >= -EPSILON && circle.y - circle.radius >= -EPSILON &&
    circle.x + circle.radius <= width + EPSILON && circle.y + circle.radius <= height + EPSILON;
}

/** Small spatial hash for repeated neighbourhood queries, keyed in world inches. */
export class SpatialIndex<T extends Circle> {
  private cells = new Map<string, T[]>();
  private readonly cellSize: number;
  constructor(cellSize = 4) { if (!(cellSize > 0)) throw new Error('Cell size must be positive'); this.cellSize = cellSize; }
  insert(item: T): void {
    for (let x = Math.floor((item.x - item.radius) / this.cellSize); x <= Math.floor((item.x + item.radius) / this.cellSize); x++) {
      for (let y = Math.floor((item.y - item.radius) / this.cellSize); y <= Math.floor((item.y + item.radius) / this.cellSize); y++) {
        const key = `${x},${y}`;
        const bucket = this.cells.get(key) ?? [];
        bucket.push(item); this.cells.set(key, bucket);
      }
    }
  }
  query(area: Circle): T[] {
    const found = new Set<T>();
    for (let x = Math.floor((area.x - area.radius) / this.cellSize); x <= Math.floor((area.x + area.radius) / this.cellSize); x++) {
      for (let y = Math.floor((area.y - area.radius) / this.cellSize); y <= Math.floor((area.y + area.radius) / this.cellSize); y++) {
        for (const item of this.cells.get(`${x},${y}`) ?? []) found.add(item);
      }
    }
    return [...found].filter(item => distance(area, item) <= area.radius + item.radius);
  }
}
