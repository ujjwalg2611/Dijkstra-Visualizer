import React, { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapVisualizer.css';
import { dijkstraOnGraph } from '../algorithms/dijkstraGraph';
import {
  buildRoadGraph,
  boundingBox,
  isAreaTooLarge,
  nearestNode,
} from './roadGraph';

// Default view: central London. The user can pan/zoom anywhere on Earth.
const DEFAULT_CENTER = [51.5074, -0.1278];
const DEFAULT_ZOOM = 14;

// Small invisible child component whose only job is to capture map clicks.
// First click sets the start, second sets the finish, third starts over.
function ClickCatcher({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    },
  });
  return null;
}

export default function MapVisualizer() {
  const [start, setStart] = useState(null); // { lat, lng }
  const [finish, setFinish] = useState(null);
  const [exploredEdges, setExploredEdges] = useState([]); // [[ [lat,lon],[lat,lon] ], ...]
  const [pathLine, setPathLine] = useState([]); // [[lat,lon], ...]
  const [distanceMeters, setDistanceMeters] = useState(null); // set once a route is found
  const [status, setStatus] = useState(
    'Click the map to set your start point.'
  );
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);

  // Cancel any in-flight animation timeouts on unmount.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const clearAnimation = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setExploredEdges([]);
    setPathLine([]);
    setDistanceMeters(null);
  };

  const handlePick = (latlng) => {
    if (busy) return;
    if (!start || (start && finish)) {
      // Fresh start (or restarting after a previous run).
      clearAnimation();
      setStart({ lat: latlng.lat, lng: latlng.lng });
      setFinish(null);
      setStatus('Now click your destination.');
    } else {
      setFinish({ lat: latlng.lat, lng: latlng.lng });
      setStatus('Ready — hit "Find Shortest Path".');
    }
  };

  const reset = () => {
    clearAnimation();
    setStart(null);
    setFinish(null);
    setStatus('Click the map to set your start point.');
  };

  const findPath = async () => {
    if (!start || !finish || busy) return;
    clearAnimation();
    setBusy(true);

    try {
      const bbox = boundingBox(start, finish);
      if (isAreaTooLarge(bbox)) {
        setStatus('Those points are too far apart — pick two closer points (within a city district).');
        setBusy(false);
        return;
      }

      setStatus('Downloading the real road network from OpenStreetMap…');
      const { nodes, adj } = await buildRoadGraph(bbox);
      if (nodes.size === 0) {
        setStatus('No roads found in that area. Try somewhere with streets.');
        setBusy(false);
        return;
      }

      const startId = nearestNode(nodes, start.lat, start.lng);
      const finishId = nearestNode(nodes, finish.lat, finish.lng);

      setStatus(`Running Dijkstra over ${nodes.size.toLocaleString()} intersections…`);
      const { visitedEdgesInOrder, pathIds, distance } = dijkstraOnGraph(
        nodes,
        adj,
        startId,
        finishId
      );

      if (pathIds.length === 0) {
        setStatus('No drivable route connects those two points.');
        setBusy(false);
        return;
      }

      // Convert node ids to [lat, lon] coordinate pairs for Leaflet.
      const exploredCoords = visitedEdgesInOrder.map(([a, b]) => [
        [nodes.get(a).lat, nodes.get(a).lon],
        [nodes.get(b).lat, nodes.get(b).lon],
      ]);
      const pathCoords = pathIds.map((id) => [
        nodes.get(id).lat,
        nodes.get(id).lon,
      ]);

      // Animate the search spreading out over ~2.5s, then draw the final path.
      animate(exploredCoords, pathCoords, distance);
    } catch (err) {
      setStatus(err.message || 'Something went wrong fetching the map data.');
      setBusy(false);
    }
  };

  // Reveal explored edges in batches so the search "grows" smoothly regardless
  // of how many edges there are, then draw the shortest path.
  const animate = (exploredCoords, pathCoords, distance) => {
    const DURATION_MS = 2500;
    const STEPS = 60;
    const batch = Math.max(1, Math.ceil(exploredCoords.length / STEPS));
    const interval = DURATION_MS / STEPS;

    for (let step = 1; step <= STEPS; step++) {
      const t = setTimeout(() => {
        setExploredEdges(exploredCoords.slice(0, batch * step));
      }, interval * step);
      timers.current.push(t);
    }

    const done = setTimeout(() => {
      setExploredEdges(exploredCoords);
      setPathLine(pathCoords);
      setDistanceMeters(distance);
      const km = (distance / 1000).toFixed(2);
      setStatus(`Shortest driving route found: ${km} km.`);
      setBusy(false);
    }, interval * STEPS + 100);
    timers.current.push(done);
  };

  return (
    <div className="map-visualizer">
      <div className="map-controls">
        <button onClick={findPath} disabled={!start || !finish || busy}>
          {busy ? 'Working…' : "Find Shortest Path"}
        </button>
        <button onClick={reset} disabled={busy}>
          Reset
        </button>
        <span className="map-status">{status}</span>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="map-canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCatcher onPick={handlePick} />

        {/* Explored roads (the Dijkstra search frontier). */}
        {exploredEdges.length > 0 && (
          <Polyline positions={exploredEdges} color="#3fa7ff" weight={3} opacity={0.6} />
        )}

        {/* Final shortest path. */}
        {pathLine.length > 0 && (
          <Polyline positions={pathLine} color="#ffd400" weight={6} opacity={0.95} />
        )}

        {start && (
          <CircleMarker center={[start.lat, start.lng]} radius={9} color="#2ecc71" fillColor="#2ecc71" fillOpacity={1} />
        )}
        {finish && (
          <CircleMarker center={[finish.lat, finish.lng]} radius={9} color="#e74c3c" fillColor="#e74c3c" fillOpacity={1} />
        )}
      </MapContainer>

      {distanceMeters !== null && (
        <div className="travel-estimates">
          <span>Route distance: <strong>{(distanceMeters / 1000).toFixed(2)} km</strong></span>
        </div>
      )}
    </div>
  );
}
