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

  function stepStamina(out, value, exhausted, wantsSprint, moving, dt) {
    if (value <= 1) exhausted = true;
    if (value >= 25) exhausted = false;
    const sprint = moving && wantsSprint && !exhausted;
    out.value = clamp(value + (sprint ? -23 : 14) * dt, 0, 100);
    out.exhausted = exhausted || out.value <= 1;
    out.sprint = sprint;
    return out;
  }
  window.KuchiieCore = Object.freeze({ sanitizeSettings, Navigation, stepStamina });
})();
