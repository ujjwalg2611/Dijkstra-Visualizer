import React from 'react';
import MapVisualizer from './MapVisualizer/MapVisualizer';

const MapVisualizerPage = () => (
  <div className="map-visualizer-page">
    <h2 style={{ textAlign: 'center' }}>Real-World Map Routing</h2>
    <p style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 8px' }}>
      Click a start and a destination on the real map. The app downloads the
      actual street network from OpenStreetMap, then runs Dijkstra's algorithm
      over it to find — and animate — the shortest driving route.
    </p>
    <MapVisualizer />
  </div>
);

export default MapVisualizerPage;
