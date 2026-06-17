// Dijkstra's algorithm on a general weighted graph (used for the real-map mode).
//
// Unlike algorithms/dijkstra.js (which walks a uniform grid where every step
// costs 1), here edges have real-world lengths in metres, so we need a proper
// priority queue to always expand the closest-so-far node first.
//
// Graph shape:
//   nodes: Map<id, { lat, lon }>
//   adj:   Map<id, Array<{ to, weight }>>   // weight = edge length in metres

// A binary min-heap keyed on distance. Plain arrays + sort would also work but
// get slow once a city has thousands of intersections, which is exactly the
// case this mode hits.
class MinHeap {
  constructor() {
    this.items = []; // each item: { id, dist }
  }

  get size() {
    return this.items.length;
  }

  push(id, dist) {
    const items = this.items;
    items.push({ id, dist });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].dist <= items[i].dist) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      const n = items.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && items[left].dist < items[smallest].dist) smallest = left;
        if (right < n && items[right].dist < items[smallest].dist) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

// Runs Dijkstra from startId to finishId.
// Returns:
//   visitedEdgesInOrder: [[fromId, toId], ...] in the order nodes were settled
//                        — this is what we animate to show the search spreading.
//   pathIds:             the node ids of the shortest path (empty if unreachable)
//   distance:            total path length in metres (Infinity if unreachable)
export function dijkstraOnGraph(nodes, adj, startId, finishId) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const visitedEdgesInOrder = [];

  for (const id of nodes.keys()) dist.set(id, Infinity);
  dist.set(startId, 0);

  const heap = new MinHeap();
  heap.push(startId, 0);

  while (heap.size > 0) {
    const { id: u, dist: d } = heap.pop();
    // Stale heap entry (we already found a shorter way here) — skip it.
    if (visited.has(u)) continue;
    visited.add(u);

    // Record the edge that first reached u, so the animation draws the
    // exploration tree edge-by-edge.
    const cameFrom = prev.get(u);
    if (cameFrom !== undefined) visitedEdgesInOrder.push([cameFrom, u]);

    if (u === finishId) break;

    const neighbors = adj.get(u) || [];
    for (const { to, weight } of neighbors) {
      if (visited.has(to)) continue;
      const candidate = d + weight;
      if (candidate < dist.get(to)) {
        dist.set(to, candidate);
        prev.set(to, u);
        heap.push(to, candidate);
      }
    }
  }

  // Reconstruct the shortest path by walking prev[] backwards from the finish.
  const pathIds = [];
  if (dist.get(finishId) !== Infinity) {
    let cur = finishId;
    while (cur !== undefined) {
      pathIds.unshift(cur);
      cur = prev.get(cur);
    }
  }

  return {
    visitedEdgesInOrder,
    pathIds,
    distance: dist.get(finishId),
  };
}
