# Dijkstra's Algorithm Visualizer

An interactive React app that brings Dijkstra's shortest-path algorithm to life
in two ways:

- **Grid Visualizer** — a classic pathfinding playground. Draw walls on a grid,
  then watch Dijkstra explore the grid cell-by-cell and trace the shortest path
  between the start and finish nodes.
- **Map Routing** — the same algorithm, but on the *real world*. Click a start
  and a destination on an interactive map; the app downloads the actual street
  network from OpenStreetMap, builds a weighted road graph, and runs Dijkstra
  over it to find and animate the shortest driving route.

## Features

- Step-by-step animation of Dijkstra's search frontier and the resulting path.
- Real road routing using live [OpenStreetMap](https://www.openstreetmap.org/)
  data via the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).
- One-way streets are respected, and edges are weighted by real geographic
  distance (haversine), so the computed route is an actual legal driving route.
- A proper binary min-heap priority queue, so routing stays fast even across
  thousands of intersections.
- An in-browser "Run Code" playground (C++ / Java / JavaScript) backed by a
  small local Express server — see the **Security note** below before running
  this part anywhere other than your own machine.

## Tech stack

- **React 18** (Create React App) with **React Router** for navigation.
- **Leaflet** / **react-leaflet** for the interactive map and tiles.
- Plain JavaScript implementations of Dijkstra's algorithm — no routing library
  does the work; the pathfinding is computed in-app.

## Getting started

```bash
cd frontend
npm install
npm start
```

This runs the app in development mode at
[http://localhost:3000](http://localhost:3000). The page reloads automatically
as you edit.

To create an optimized production build:

```bash
npm run build
```

## How the Map Routing works

1. You click two points on the map (start and destination).
2. The app computes a bounding box around them and queries the Overpass API for
   every drivable road in that area.
3. Each road is split into edges between consecutive points, weighted by their
   real-world length; one-way tags are honoured.
4. The clicked points are snapped to the nearest road intersection.
5. Dijkstra's algorithm runs over the resulting graph, recording the order in
   which nodes are settled so the search can be animated, then reconstructs the
   shortest path.

> Tip: pick two points within the same city district. Very large areas are
> rejected to keep the Overpass download and the in-browser computation fast.

## Project structure

```
frontend/
  src/
    algorithms/
      dijkstra.js        # Dijkstra on the uniform grid (BFS-equivalent)
      dijkstraGraph.js   # Dijkstra on a weighted graph + binary min-heap
    PathfindingVisualizer/ # the grid mode
    MapVisualizer/         # the real-map mode (map UI + OSM road-graph loader)
    App.js                 # routes: Home, Grid Visualizer, Map Routing
backend/
  server.js              # Express server backing the homepage's "Run Code" playground
  main.cpp                # sample C++ file used by the code runner
```
