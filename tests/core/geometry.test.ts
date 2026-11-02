import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baseDistance, circlePolygonIntersects, circleToPolygonDistance, circlesOverlap, coherent, distance, distance3D, engaged, inBounds, pathHitsCircle, pathIntersectsPolygon, pathsCollide, pointInPolygon, pointSegmentDistance, segmentDistance, segmentsIntersect, SpatialIndex } from '../../packages/geometry/index';

const square = [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }];
const circle = (x: number, y: number, radius = 0.5, z = 0) => ({ x, y, radius, z });

describe('world-space geometry', () => {
  it('measures centres and base edges independently of camera scale', () => {
    assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.equal(baseDistance(circle(0, 0, 1), circle(5, 0, 2)), 2);
    assert.equal(baseDistance(circle(0, 0, 1), circle(1, 0, 1)), 0);
    assert.equal(distance3D({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 }), 5);
  });
  it('allows tangency but forbids overlap', () => {
    assert.equal(circlesOverlap(circle(0, 0), circle(1, 0)), false);
    assert.equal(circlesOverlap(circle(0, 0), circle(0.99, 0)), true);
    assert.equal(circlesOverlap(circle(0, 0), circle(0, 0, 0.5, 5)), false);
    assert.equal(inBounds(circle(0.5, 0.5), 44, 30), true);
    assert.equal(inBounds(circle(0.49, 0.5), 44, 30), false);
  });
  it('handles concave polygons, boundaries and circle intersections', () => {
    assert.equal(pointInPolygon({ x: 3, y: 3 }, square), true);
    assert.equal(pointInPolygon({ x: 2, y: 3 }, square), true);
    assert.equal(pointInPolygon({ x: 1, y: 3 }, square), false);
    assert.equal(circlePolygonIntersects(circle(1.5, 3), square), true);
    assert.equal(circlePolygonIntersects(circle(1.4, 3), square), false);
    assert.equal(circleToPolygonDistance(circle(0.5, 3), square), 1);
    assert.equal(circleToPolygonDistance(circle(3, 3), square), 0);
    const concave = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }];
    assert.equal(pointInPolygon({ x: 0.5, y: 3 }, concave), true);
    assert.equal(pointInPolygon({ x: 3, y: 3 }, concave), false);
  });
  it('detects continuous paths through thin walls without sampling', () => {
    const thin = [{ x: 5, y: 0 }, { x: 5.001, y: 0 }, { x: 5.001, y: 10 }, { x: 5, y: 10 }];
    assert.equal(pathIntersectsPolygon({ x: 0, y: 5 }, { x: 10, y: 5 }, 0.5, thin), true);
    assert.equal(pathIntersectsPolygon({ x: 0, y: 11 }, { x: 10, y: 11 }, 0.5, thin), false);
    assert.equal(pathIntersectsPolygon({ x: 0, y: 10.3 }, { x: 10, y: 10.3 }, 0.5, thin), true);
    assert.equal(pathHitsCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, circle(5, 0.4)), true);
  });
  it('handles segment crossings, collinearity and zero-length paths', () => {
    assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }), true);
    assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }, { x: 5, y: 0 }), true);
    assert.equal(segmentDistance({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }, { x: 4, y: 2 }), 2);
    assert.equal(pointSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
  });
  it('checks simultaneous model paths in relative coordinates', () => {
    assert.equal(pathsCollide(circle(0, 0), { x: 5, y: 0 }, circle(1.5, 0), { x: 6.5, y: 0 }), false);
    assert.equal(pathsCollide(circle(0, 0), { x: 5, y: 0 }, circle(5, 0), { x: 0, y: 0 }), true);
  });
  it('checks a local neighbour and whole-unit span including elevation', () => {
    assert.equal(coherent([circle(0, 0)]), true);
    assert.equal(coherent([circle(0, 0), circle(3, 0)]), true);
    assert.equal(coherent([circle(0, 0), circle(3.01, 0)]), false);
    assert.equal(coherent([0, 3, 6, 9, 12].map(x => circle(x, 0))), false);
    assert.equal(coherent([circle(0, 0), circle(1, 0, 0.5, 5.1)]), false);
  });
  it('engagement uses 2-inch horizontal and 5-inch vertical training thresholds', () => {
    assert.equal(engaged(circle(0, 0), circle(3, 0, 0.5, 5)), true);
    assert.equal(engaged(circle(0, 0), circle(3.01, 0)), false);
    assert.equal(engaged(circle(0, 0), circle(1, 0, 0.5, 5.01)), false);
  });
  it('spatial queries deduplicate large bases and filter distant buckets', () => {
    const index = new SpatialIndex();
    const large = circle(5, 5, 3), distant = circle(20, 20);
    index.insert(large); index.insert(distant);
    assert.deepEqual(index.query(circle(5, 5, 1)), [large]);
    assert.deepEqual(index.query(circle(0, 0, 0.2)), []);
    assert.throws(() => new SpatialIndex(0));
  });
});
