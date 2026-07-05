// Builds a routable graph of real streets from OpenStreetMap data.
//
// We use the free Overpass API: given a bounding box, it returns every road
// ("highway") in that area as a list of "ways" (a way = an ordered list of
// node ids) plus the lat/lon of each node. We turn that into:
//   nodes: Map<id, { lat, lon }>
//   adj:   Map<id, Array<{ to, weight }>>   // weight = segment length in metres
// which is exactly what dijkstraOnGraph() expects.

const OVERPASS_PROXY_URL = '/api/overpass';

// Road types a car can actually drive on. We skip footways, cycleways, steps,
// etc. so the route is a real driving route, not a shortcut through a park.
const DRIVABLE = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'service', 'road',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
  'tertiary_link',
]);

// Great-circle distance between two lat/lon points, in metres.
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Bounding box covering both points, with ~30% padding so the route isn't
// clipped by a road that briefly leaves the box.
export function boundingBox(a, b) {
  const padLat = Math.abs(a.lat - b.lat) * 0.3 + 0.003;
  const padLon = Math.abs(a.lng - b.lng) * 0.3 + 0.003;
  return {
    south: Math.min(a.lat, b.lat) - padLat,
    west: Math.min(a.lng, b.lng) - padLon,
    north: Math.max(a.lat, b.lat) + padLat,
    east: Math.max(a.lng, b.lng) + padLon,
  };
}

// Rough area guard. Overpass times out (and the browser chokes) on huge areas,
// so we refuse anything bigger than ~city-district scale and ask the user to
// pick closer points.
export function isAreaTooLarge(bbox) {
  const latSpanKm = (bbox.north - bbox.south) * 111;
  const lonSpanKm =
    (bbox.east - bbox.west) * 111 * Math.cos((bbox.north * Math.PI) / 180);
  return latSpanKm * lonSpanKm > 150; // ~150 km²
}

// Fetches roads in the bbox and builds the graph. Returns { nodes, adj }.
export async function buildRoadGraph(bbox) {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = `
    [out:json][timeout:25];
    (way["highway"](${bboxStr}););
    (._;>;);
    out body;
  `;

  const res = await fetch(OVERPASS_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ||
        `Overpass request failed (${res.status}). Try again in a moment — the public server is rate-limited.`
    );
  }
  const data = await res.json();

  const nodes = new Map();
  const adj = new Map();

  // First pass: collect node coordinates.
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const addEdge = (from, to) => {
    const a = nodes.get(from);
    const b = nodes.get(to);
    if (!a || !b) return;
    const w = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, weight: w });
  };

  // Second pass: turn each drivable way into edges between consecutive nodes,
  // honouring one-way streets so the route is actually legal to drive.
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.tags) continue;
    if (!DRIVABLE.has(el.tags.highway)) continue;

    const oneway = el.tags.oneway;
    const refs = el.nodes;
    for (let i = 0; i < refs.length - 1; i++) {
      const a = refs[i];
      const b = refs[i + 1];
      if (oneway === 'yes' || oneway === 'true' || oneway === '1') {
        addEdge(a, b);
      } else if (oneway === '-1' || oneway === 'reverse') {
        addEdge(b, a);
      } else {
        addEdge(a, b);
        addEdge(b, a);
      }
    }
  }

  // Drop nodes that no drivable road actually touches, so "nearest node"
  // never snaps the user onto an isolated point.
  const connected = new Set();
  for (const [from, edges] of adj) {
    connected.add(from);
    for (const e of edges) connected.add(e.to);
  }
  for (const id of [...nodes.keys()]) {
    if (!connected.has(id)) nodes.delete(id);
  }

  return { nodes, adj };
}

// Finds the graph node closest to a clicked lat/lng (linear scan — fine for
// the few-thousand-node graphs this mode produces).
export function nearestNode(nodes, lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, n] of nodes) {
    const d = haversine(lat, lng, n.lat, n.lon);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}
