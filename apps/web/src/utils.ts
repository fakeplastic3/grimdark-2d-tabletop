import type { Point, Unit } from '../../../packages/shared/types';

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function living(unit: Unit) { return unit.models.filter(model => model.wounds > 0); }
export function center(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
}
export function formation(unit: Unit, point: Point): Point[] {
  const models = living(unit); const spacing = (models[0]?.radius ?? 0.63) * 2 + 0.12;
  const columns = Math.min(4, Math.ceil(Math.sqrt(models.length)));
  const rows = Math.ceil(models.length / columns);
  return models.map((_, index) => ({ x: point.x + ((index % columns) - (columns - 1) / 2) * spacing, y: point.y + (Math.floor(index / columns) - (rows - 1) / 2) * spacing }));
}
export function translate(unit: Unit, point: Point): Point[] {
  const models = living(unit); const origin = center(models);
  return models.map(model => ({ x: model.x + point.x - origin.x, y: model.y + point.y - origin.y, z: model.z ?? 0 }));
}
export const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight'] as const;
export const title = (value: string) => value.slice(0, 1).toUpperCase() + value.slice(1);
