(function applyUltraTerrain(root) {
  'use strict';

  const Terrain = root.DriftPhysics?.SplineTerrain;
  if (!Terrain || Terrain.prototype.__ultraTerrain) return;
  const proto = Terrain.prototype;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const originalReset = proto.reset;
  const originalEnsure = proto.ensure;
  const originalAppend = proto.append;

  function invalidate(terrain, from = 0) {
    terrain._fastSegments ||= [];
    terrain._fastTangents ||= [];
    terrain._fastSegments.length = Math.max(0, Math.min(terrain._fastSegments.length, from));
    terrain._fastTangents.length = Math.max(0, Math.min(terrain._fastTangents.length, from));
    terrain._fastCursor = clamp(terrain._fastCursor || 0, 0, Math.max(0, terrain.points.length - 2));
  }

  proto.reset = function reset(seed) {
    const result = originalReset.call(this, seed);
    this._fastSegments = [];
    this._fastTangents = [];
    this._fastCursor = 0;
    return result;
  };

  proto.ensure = function ensure(targetX) {
    const before = this.points?.length || 0;
    const result = originalEnsure.call(this, targetX);
    const after = this.points?.length || 0;
    if (after !== before) invalidate(this, Math.max(0, before - 3));
    return result;
  };

  proto.append = function append(y, requestedWidth, kind) {
    const before = this.points?.length || 0;
    const result = originalAppend.call(this, y, requestedWidth, kind);
    invalidate(this, Math.max(0, before - 3));
    return result;
  };

  proto.segmentIndex = function segmentIndex(x) {
    this.ensure(x + 2800);
    const max = Math.max(0, this.points.length - 2);
    let index = clamp(this._fastCursor || 0, 0, max);

    if (x >= this.points[index].x && x <= this.points[index + 1].x) {
      this._fastCursor = index;
      return index;
    }

    if (x > this.points[index + 1].x) {
      while (index < max && x > this.points[index + 1].x) index += 1;
      if (x >= this.points[index].x && x <= this.points[index + 1].x) {
        this._fastCursor = index;
        return index;
      }
    } else {
      while (index > 0 && x < this.points[index].x) index -= 1;
      if (x >= this.points[index].x && x <= this.points[index + 1].x) {
        this._fastCursor = index;
        return index;
      }
    }

    let low = 0;
    let high = max;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (x < this.points[middle].x) high = middle - 1;
      else if (x > this.points[middle + 1].x) low = middle + 1;
      else {
        this._fastCursor = middle;
        return middle;
      }
    }
    index = clamp(low, 0, max);
    this._fastCursor = index;
    return index;
  };

  proto._fastTangent = function fastTangent(index) {
    this._fastTangents ||= [];
    const cached = this._fastTangents[index];
    if (cached !== undefined) return cached;
    const point = this.points[index];
    const before = this.points[Math.max(0, index - 1)];
    const after = this.points[Math.min(this.points.length - 1, index + 1)];
    let tangent = 0;
    if (before !== point && after !== point) {
      const left = point.y - before.y;
      const right = after.y - point.y;
      if (left !== 0 && right !== 0 && Math.sign(left) === Math.sign(right)) {
        const raw = (after.y - before.y) / Math.max(1, after.x - before.x);
        tangent = clamp(raw * 0.64, -this.maxSlope * 0.78, this.maxSlope * 0.78);
      }
    }
    this._fastTangents[index] = tangent;
    return tangent;
  };

  proto._fastSegment = function fastSegment(index) {
    this._fastSegments ||= [];
    const cached = this._fastSegments[index];
    if (cached) return cached;
    const a = this.points[index];
    const b = this.points[index + 1];
    const width = Math.max(1, b.x - a.x);
    const m0 = this._fastTangent(index);
    const m1 = this._fastTangent(index + 1);
    const A = 2 * a.y - 2 * b.y + width * (m0 + m1);
    const B = -3 * a.y + 3 * b.y - width * (2 * m0 + m1);
    const C = width * m0;
    const segment = {
      x0: a.x,
      width,
      invWidth: 1 / width,
      invWidth2: 1 / (width * width),
      invWidth3: 1 / (width * width * width),
      A,
      B,
      C,
      D: a.y,
      index
    };
    this._fastSegments[index] = segment;
    return segment;
  };

  proto.sample = function sample(x) {
    const index = this.segmentIndex(x);
    const segment = this._fastSegment(index);
    const t = clamp((x - segment.x0) * segment.invWidth, 0, 1);
    const t2 = t * t;
    const rawY = ((segment.A * t + segment.B) * t + segment.C) * t + segment.D;
    const y = clamp(rawY, this.top - 20, this.bottom + 15);
    const slope = clamp(
      (3 * segment.A * t2 + 2 * segment.B * t + segment.C) * segment.invWidth,
      -this.maxSlope * 1.03,
      this.maxSlope * 1.03
    );
    const second = (6 * segment.A * t + 2 * segment.B) * segment.invWidth2;
    const third = 6 * segment.A * segment.invWidth3;
    const q = Math.hypot(1, slope);
    const curvature = second / (q * q * q);
    return { y, slope, second, third, curvature, index };
  };

  proto.height = function height(x) {
    const index = this.segmentIndex(x);
    const segment = this._fastSegment(index);
    const t = clamp((x - segment.x0) * segment.invWidth, 0, 1);
    return clamp(((segment.A * t + segment.B) * t + segment.C) * t + segment.D, this.top - 20, this.bottom + 15);
  };

  proto.centerHeight = function centerHeight(x, radius = 0) {
    const sample = this.sample(x);
    return sample.y - radius * Math.hypot(1, sample.slope);
  };

  proto.frame = function frame(x, radius = 0) {
    const sample = this.sample(x);
    const epsilon = 1.5;
    const centerY = sample.y - radius * Math.hypot(1, sample.slope);
    const before = this.sample(x - epsilon);
    const after = this.sample(x + epsilon);
    const beforeY = before.y - radius * Math.hypot(1, before.slope);
    const afterY = after.y - radius * Math.hypot(1, after.slope);
    const centerSlope = (afterY - beforeY) / (epsilon * 2);
    const centerSecond = (afterY - 2 * centerY + beforeY) / (epsilon * epsilon);
    const centerLength = Math.hypot(1, centerSlope);
    const tx = 1 / centerLength;
    const ty = centerSlope / centerLength;
    const nx = centerSlope / centerLength;
    const ny = -1 / centerLength;
    const centerCurvature = centerSecond / Math.pow(1 + centerSlope * centerSlope, 1.5);
    return {
      ...sample,
      groundSlope: sample.slope,
      groundCurvature: sample.curvature,
      slope: centerSlope,
      curvature: centerCurvature,
      second: centerSecond,
      tx,
      ty,
      nx,
      ny,
      length: centerLength,
      centerY
    };
  };

  proto.__ultraTerrain = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
