'use strict';
/* Pure, browser-independent game rules. Shared by production and regression tests. */
(() => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function sanitizeSettings(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const number = (key, fallback, min, max) => typeof source[key] === 'number' && Number.isFinite(source[key])
      ? clamp(source[key], min, max) : fallback;
    return {
      quality: ['high', 'low', 'xhigh'].includes(source.quality) ? source.quality : 'high',
      sensitivity: number('sensitivity', 1, .4, 2),
      volume: number('volume', .6, 0, 1),
      reduced: source.reduced === true
    };
  }

  class Navigation {
    constructor(grid, cellSize) {
      this.grid = grid;
      this.cell = cellSize;
      this.height = grid.length;
      this.width = grid[0].length;
      this.queue = new Int32Array(this.width * this.height);
      this.previous = new Int32Array(this.queue.length);
      this.searches = 0;
    }
    cellId(position) {
      const x = Math.round(position.x / this.cell), z = Math.round(position.z / this.cell);
      return this.walkable(x, z) ? z * this.width + x : -1;
    }
    walkable(x, z) {
      return x >= 0 && z >= 0 && x < this.width && z < this.height && this.grid[z][x] === 0;
    }
    canStand(x, z, radius = .24) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const left = Math.round((x - radius) / this.cell), right = Math.round((x + radius) / this.cell);
      const near = Math.round((z - radius) / this.cell), far = Math.round((z + radius) / this.cell);
      return this.walkable(left, near) && this.walkable(right, near)
        && this.walkable(left, far) && this.walkable(right, far);
    }
    move(position, dx, dz, radius = .24) {
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
      // Subdivide movement instead of testing only the endpoint: no wall tunnelling.
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (this.cell * .15)));
      if (steps > 2048) return false;
      const sx = dx / steps, sz = dz / steps, oldX = position.x, oldZ = position.z;
      for (let i = 0; i < steps; i++) {
        if (this.canStand(position.x + sx, position.z, radius)) position.x += sx;
        if (this.canStand(position.x, position.z + sz, radius)) position.z += sz;
      }
      return Math.abs(position.x - oldX) + Math.abs(position.z - oldZ) > .00001;
    }
    clearSight(from, to, radius = .12) {
      const dx = to.x - from.x, dz = to.z - from.z;
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (this.cell * .1)));
      if (steps > 4096) return false;
      for (let i = 0; i <= steps; i++) {
        if (!this.canStand(from.x + dx * i / steps, from.z + dz * i / steps, radius)) return false;
      }
      return true;
    }
    findPath(from, to, radius = .25) {
      this.searches++;
      const start = this.cellId(from), goal = this.cellId(to);
      if (start < 0 || goal < 0 || start === goal) return [];
      const previous = this.previous, queue = this.queue, width = this.width;
      previous.fill(-2);
      previous[start] = -1;
      queue[0] = start;
      let read = 0, write = 1;
      const enqueue = (x, z, parent) => {
        if (!this.walkable(x, z)) return;
        const id = z * width + x;
        if (previous[id] !== -2) return;
        previous[id] = parent;
        queue[write++] = id;
      };
      while (read < write) {
        const id = queue[read++];
        if (id === goal) {
          const path = [];
          for (let node = id; node !== -1; node = previous[node]) {
            path.push({ x: (node % width) * this.cell, y: 0, z: Math.floor(node / width) * this.cell });
          }
          path.reverse();
          // Preserve a safe current-cell center at corners; skip it only with clearance.
          if (path.length > 1 && this.clearSight(from, path[1], radius)) path.shift();
          return path;
        }
        const x = id % width, z = Math.floor(id / width);
        enqueue(x + 1, z, id); enqueue(x - 1, z, id);
        enqueue(x, z + 1, id); enqueue(x, z - 1, id);
      }
      return [];
    }
  }

  // Three original-sized wings: the old house, east wing, and its upper floor.
  function createHouse() {
    const cell = 2, floorHeight = 4.2, width = 37, height = 19;
    const floors = Array.from({ length: 2 }, () => Array.from({ length: height }, () => Array(width).fill(1)));
    const carve = (level, x1, z1, x2, z2) => {
      for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) floors[level][z][x] = 0;
    };
    for (const [level, offset] of [[0, 0], [0, 18], [1, 18]]) {
      carve(level, offset + 8, 1, offset + 10, 17);
      for (const z of [1, 7, 13]) {
        carve(level, offset + 1, z, offset + 6, z + 4);
        carve(level, offset + 12, z, offset + 17, z + 4);
        carve(level, offset + 6, z + 2, offset + 12, z + 2);
      }
      for (const z of [5, 11]) for (const x of [3, 4, 14, 15]) floors[level][z][offset + x] = 1;
    }
    for (const z of [4, 10, 16]) carve(0, 17, z, 19, z);
    // Enclosed straight stair: lower entrance at (19,16), upper landing at (25,16).
    // Only the east end connects to upstairs; walls prevent entering from the sides.
    for (const level of [0, 1]) {
      for (let x = 20; x <= 24; x++) {
        floors[level][15][x] = floors[level][17][x] = 1;
        floors[level][16][x] = level === 0 ? 0 : 1;
      }
    }
    floors[0][16][25] = 1;
    floors[1][16][25] = 0;
    // The stair enclosure replaces the old doorway; reconnect the upstairs side room.
    carve(1, 24, 14, 26, 14);
    const stairs = { z: 16, first: 20, last: 24, landing: 25, startX: 39, endX: 49, steps: 20 };
    const talismans = [{ x: 4, z: 6, floor: 0 }, { x: 66, z: 6, floor: 0 }, { x: 66, z: 30, floor: 1 }];
    return { floors, cell, floorHeight, width, height, stairs, talismans };
  }

  class HouseNavigation {
    constructor(house) {
      Object.assign(this, house);
      this.layers = this.floors.map(grid => new Navigation(grid, this.cell));
      this.searches = 0;
      this.layerSize = this.width * this.height;
    }
    level(point) {
      // Three.Vector3 already has a floor() method: only numeric metadata is a level.
      return Number.isInteger(point.floor) ? point.floor : Math.max(0, Math.floor((point.y || 0) / this.floorHeight));
    }
    cellId(point) {
      const floor = this.level(point), id = this.layers[floor]?.cellId(point) ?? -1;
      return id < 0 ? -1 : floor * this.layerSize + id;
    }
    point(id) {
      const floor = Math.floor(id / this.layerSize), local = id % this.layerSize;
      const point = { x: local % this.width * this.cell, z: Math.floor(local / this.width) * this.cell, floor };
      point.y = this.surfaceHeight(point);
      return point;
    }
    onStairs(point) {
      return this.level(point) === 0 && Math.round(point.z / this.cell) === this.stairs.z
        && point.x >= this.stairs.startX && point.x < this.stairs.endX;
    }
    surfaceHeight(point) {
      if (!this.onStairs(point)) return this.level(point) * this.floorHeight;
      const progress = (point.x - this.stairs.startX) / (this.stairs.endX - this.stairs.startX);
      return Math.ceil(progress * this.stairs.steps) / this.stairs.steps * this.floorHeight;
    }
    canStand(x, z, radius = .24, floor = 0) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !this.layers[floor]) return false;
      for (const cx of [Math.round((x - radius) / this.cell), Math.round((x + radius) / this.cell)]) {
        for (const cz of [Math.round((z - radius) / this.cell), Math.round((z + radius) / this.cell)]) {
          // Clearance across the one stair/landing seam, not through the rest of the ceiling.
          if (cz === this.stairs.z && ((floor === 0 && cx === this.stairs.landing && x >= 47 && x < this.stairs.endX)
            || (floor === 1 && cx === this.stairs.last))) continue;
          if (!this.layers[floor].walkable(cx, cz)) return false;
        }
      }
      return true;
    }
    move(position, dx, dz, radius = .24) {
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (this.cell * .1)));
      if (steps > 2048) return false;
      const oldX = position.x, oldZ = position.z;
      position.floor = this.level(position);
      for (let i = 0; i < steps; i++) {
        for (const [axis, delta] of [['x', dx / steps], ['z', dz / steps]]) {
          const x = position.x + (axis === 'x' ? delta : 0), z = position.z + (axis === 'z' ? delta : 0);
          let floor = position.floor;
          if (Math.round(z / this.cell) === this.stairs.z) {
            if (floor === 0 && this.onStairs(position) && x >= this.stairs.endX) floor = 1;
            else if (floor === 1 && position.x >= this.stairs.endX && x < this.stairs.endX) floor = 0;
          }
          if (this.canStand(x, z, radius, floor)) { position[axis] += delta; position.floor = floor; }
        }
      }
      position.y = this.surfaceHeight(position) + (position.eyeHeight || 0);
      return Math.hypot(position.x - oldX, position.z - oldZ) > .00001;
    }
    clearSight(from, to, radius = .12) {
      if (this.level(from) !== this.level(to)) return false;
      // Stairwell geometry blocks direct shortcuts; follow the connected route instead.
      if (this.onStairs(from) !== this.onStairs(to)) return false;
      return this.layers[this.level(from)]?.clearSight(from, to, radius) || false;
    }
    findPath(from, to, radius = .25) {
      this.searches++;
      const start = this.cellId(from), goal = this.cellId(to);
      if (start < 0 || goal < 0 || start === goal) return [];
      const previous = new Int32Array(this.layerSize * this.floors.length).fill(-2), queue = [start];
      previous[start] = -1;
      for (let read = 0; read < queue.length; read++) {
        const id = queue[read], point = this.point(id);
        if (id === goal) {
          const path = [];
          for (let node = goal; node !== -1; node = previous[node]) path.push(this.point(node));
          path.reverse();
          if (path.length > 1 && this.clearSight(from, path[1], radius)) path.shift();
          return path;
        }
        const neighbors = [[point.x + this.cell, point.z, point.floor], [point.x - this.cell, point.z, point.floor],
          [point.x, point.z + this.cell, point.floor], [point.x, point.z - this.cell, point.floor]];
        if (point.z === this.stairs.z * this.cell) {
          if (point.floor === 0 && point.x === this.stairs.last * this.cell)
            neighbors.push([this.stairs.landing * this.cell, point.z, 1]);
          if (point.floor === 1 && point.x === this.stairs.landing * this.cell)
            neighbors.push([this.stairs.last * this.cell, point.z, 0]);
        }
        for (const [x, z, floor] of neighbors) {
          const next = this.cellId({ x, z, floor });
          if (next < 0 || previous[next] !== -2) continue;
          previous[next] = id; queue.push(next);
        }
      }
      return [];
    }
  }

  function stepStamina(out, value, exhausted, wantsSprint, moving, dt) {
    if (value <= 1) exhausted = true;
    if (value >= 25) exhausted = false;
    const sprint = moving && wantsSprint && !exhausted;
    out.value = clamp(value + (sprint ? -23 : 14) * dt, 0, 100);
    out.exhausted = exhausted || out.value <= 1;
    out.sprint = sprint;
    return out;
  }
  window.KuchiieCore = Object.freeze({ sanitizeSettings, Navigation, createHouse, HouseNavigation, stepStamina });
})();
