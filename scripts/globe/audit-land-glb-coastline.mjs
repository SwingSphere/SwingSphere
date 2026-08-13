import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const LAND_PATH = path.join(ROOT_DIR, "public/assets/globe/models/land.glb");
const OCEAN_PATH = path.join(ROOT_DIR, "public/assets/globe/models/ocean.glb");
const TEMP_OUTPUT_DIR = path.join(ROOT_DIR, ".codex-temp/globe-model-audit");
const PUBLIC_OUTPUT_DIR = path.join(ROOT_DIR, "public/assets/globe/models/audit");
const AUDIT_PATH = path.join(TEMP_OUTPUT_DIR, "land-glb-audit.json");
const DIAGNOSTIC_PATH = path.join(PUBLIC_OUTPUT_DIR, "land-coastline-diagnostics.json");

const WELD_TOLERANCES = [0, 1e-7, 1e-6, 1e-5, 1e-4, 5e-4, 1e-3, 5e-3, 1e-2];
const RIM_ATTEMPTS = [
  { id: "outward-to-nonoutward", terrainMin: 0.000001, otherMax: 0 },
  { id: "outward025-to-inward", terrainMin: 0.025, otherMax: -0.025 },
  { id: "top075-to-side025", terrainMin: 0.75, otherMax: 0.25 },
  { id: "top060-to-side025", terrainMin: 0.6, otherMax: 0.25 },
  { id: "top050-to-side020", terrainMin: 0.5, otherMax: 0.2 },
  { id: "top035-to-side015", terrainMin: 0.35, otherMax: 0.15 },
  { id: "top025-to-nonpositive", terrainMin: 0.25, otherMax: 0 },
  { id: "top075-to-underside", terrainMin: 0.75, otherMax: -0.25 }
];
const VALIDATION_REGIONS = {
  australiaMainland: { lon: [112, 155], lat: [-40, -9] },
  tasmania: { lon: [143, 150], lat: [-45, -39] },
  madagascar: { lon: [42, 52], lat: [-27, -10] },
  greenland: { lon: [-75, -8], lat: [58, 85] },
  japan: { lon: [128, 147], lat: [29, 47] },
  southAfrica: { lon: [15, 34], lat: [-36, -21] },
  lower48: { lon: [-126, -65], lat: [23, 51] },
  brazil: { lon: [-75, -32], lat: [-35, 7] }
};

const land = readGlb(LAND_PATH);
const ocean = readGlb(OCEAN_PATH);
const landGeometry = collectGeometry(land);
const oceanGeometry = collectGeometry(ocean);
const landBounds = calculateBounds(landGeometry.positions);
const oceanBounds = calculateBounds(oceanGeometry.positions);
const orientation = analyzeOrientation(landGeometry);

const topologyByTolerance = [];
const rawIndexedTopology = analyzeTopology(landGeometry, {
  tolerance: "raw-index",
  positions: landGeometry.positions,
  originalToWelded: Uint32Array.from({ length: landGeometry.positions.length / 3 }, (_, index) => index),
  originalCount: landGeometry.positions.length / 3,
  weldedCount: landGeometry.positions.length / 3
});
let analysisTopology = null;
for (const tolerance of WELD_TOLERANCES) {
  const welded = weldPositions(landGeometry.positions, tolerance);
  const topology = analyzeTopology(landGeometry, welded);
  topologyByTolerance.push(summarizeTopology(tolerance, welded, topology));
  if (tolerance === 1e-5) analysisTopology = { welded, topology };
}

if (!analysisTopology) throw new Error("Analysis weld topology was not generated.");
const { welded, topology } = analysisTopology;
const radialLayers = classifyRadialLayers(landGeometry, welded);
const rimAttempts = RIM_ATTEMPTS.map((attempt) => analyzeRimAttempt({
  attempt,
  geometry: landGeometry,
  welded,
  topology,
  faceScores: orientation.faceScores
}));
const structuralRim = analyzeStructuralRim({ welded, topology, radialLayers });
const selectedRim = rimAttempts.find((attempt) => attempt.id === "outward-to-nonoutward");
const mask = buildRadialLandMask({
  width: 2048,
  height: 1024,
  geometry: landGeometry,
  faceScores: orientation.faceScores,
  terrainMin: 0
});
const maskPaths = traceMaskBoundary(mask);
const maskSummary = summarizePaths(maskPaths.map((points) => ({ points })), mask.width, mask.height, true);
const simplification = buildMaskSimplificationReport(maskPaths, mask.width, mask.height);

const audit = {
  generatedAt: new Date().toISOString(),
  immutableInputs: {
    land: relativePath(LAND_PATH),
    ocean: relativePath(OCEAN_PATH),
    landBytes: fs.statSync(LAND_PATH).size,
    oceanBytes: fs.statSync(OCEAN_PATH).size
  },
  land: summarizeGlb(land, landGeometry, landBounds),
  ocean: summarizeGlb(ocean, oceanGeometry, oceanBounds),
  runtimeCoordinateBasis: {
    modelLocalToWgs84: "lng = wrap(degrees(atan2(z, x)) - 90); lat = degrees(asin(y / radius))",
    labGlobeScale: 1.04,
    runtimeCentering: "GlobeRenderer translates the shared globe parent by the negated combined land/ocean bounding-box center.",
    visibleAndHitMeshTransforms: "landHitMesh copies visibleLandMesh position, quaternion, and scale; both share the globe parent."
  },
  topology: {
    analysisWeldTolerance: 1e-5,
    rawIndexed: summarizeTopology("raw-index", {
      tolerance: "raw-index",
      positions: landGeometry.positions,
      originalCount: landGeometry.positions.length / 3,
      weldedCount: landGeometry.positions.length / 3
    }, rawIndexedTopology, { includePathDetails: false }),
    tolerances: topologyByTolerance
  },
  orientation: summarizeOrientation(orientation),
  rimAttempts: rimAttempts.map(stripRimPaths),
  radialLayerClassification: stripRadialLayerDetails(radialLayers),
  structuralRim: stripRimPaths(structuralRim),
  selectedRim: stripRimPaths(selectedRim),
  radialMask: {
    width: mask.width,
    height: mask.height,
    terrainMin: mask.terrainMin,
    landPixelCount: mask.landPixelCount,
    landCoverage: mask.landPixelCount / (mask.width * mask.height),
    ...maskSummary
  },
  simplification
};

fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_OUTPUT_DIR, { recursive: true });
fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(DIAGNOSTIC_PATH, `${JSON.stringify(buildDiagnosticAsset({
  selectedRim,
  welded,
  topology,
  geometry: landGeometry,
  faceScores: orientation.faceScores,
  maskPaths,
  maskWidth: mask.width,
  maskHeight: mask.height
}))}\n`);

console.log(JSON.stringify({
  audit: relativePath(AUDIT_PATH),
  diagnostic: relativePath(DIAGNOSTIC_PATH),
  land: {
    vertexCount: audit.land.vertexCount,
    triangleCount: audit.land.triangleCount,
    nodeCount: audit.land.nodeCount,
    meshCount: audit.land.meshCount,
    primitiveCount: audit.land.primitiveCount
  },
  topology: audit.topology.tolerances.map(({ tolerance, weldedVertexCount, oneTriangleEdgeCount, twoTriangleEdgeCount, nonManifoldEdgeCount, connectedTriangleIslandCount, boundaryPathCount }) => ({
    tolerance,
    weldedVertexCount,
    oneTriangleEdgeCount,
    twoTriangleEdgeCount,
    nonManifoldEdgeCount,
    connectedTriangleIslandCount,
    boundaryPathCount
  })),
  rawIndexedTopology: {
    oneTriangleEdgeCount: audit.topology.rawIndexed.oneTriangleEdgeCount,
    twoTriangleEdgeCount: audit.topology.rawIndexed.twoTriangleEdgeCount,
    connectedTriangleIslandCount: audit.topology.rawIndexed.connectedTriangleIslandCount
  },
  orientation: audit.orientation,
  radialLayerClassification: audit.radialLayerClassification,
  selectedRim: {
    id: audit.selectedRim.id,
    candidateEdgeCount: audit.selectedRim.candidateEdgeCount,
    connectedPathCount: audit.selectedRim.connectedPathCount,
    closedPathCount: audit.selectedRim.closedPathCount,
    openPathCount: audit.selectedRim.openPathCount,
    branchVertexCount: audit.selectedRim.branchVertexCount,
    regionMatchCounts: Object.fromEntries(Object.entries(audit.selectedRim.regionMatches).map(([id, matches]) => [id, matches.length]))
  },
  radialMask: {
    width: audit.radialMask.width,
    height: audit.radialMask.height,
    landPixelCount: audit.radialMask.landPixelCount,
    landCoverage: audit.radialMask.landCoverage,
    connectedPathCount: audit.radialMask.connectedPathCount,
    closedPathCount: audit.radialMask.closedPathCount,
    regionMatchCounts: Object.fromEntries(Object.entries(audit.radialMask.regionMatches).map(([id, matches]) => [id, matches.length]))
  },
  simplification
}, null, 2));

function readGlb(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString("utf8", 0, 4) !== "glTF") throw new Error(`${filePath} is not a GLB.`);
  const version = bytes.readUInt32LE(4);
  const declaredLength = bytes.readUInt32LE(8);
  let offset = 12;
  let json = null;
  const binaryChunks = [];
  while (offset < declaredLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString("utf8").replace(/[\u0000\s]+$/u, ""));
    if (chunkType === 0x004e4942) binaryChunks.push(data);
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error(`${filePath} has no JSON chunk.`);
  return { filePath, version, declaredLength, json, binaryChunks };
}

function collectGeometry(glb) {
  const { json } = glb;
  const parentByNode = new Map();
  json.nodes?.forEach((node, nodeIndex) => node.children?.forEach((child) => parentByNode.set(child, nodeIndex)));
  const nodeMatrices = (json.nodes ?? []).map((_, index) => resolveNodeWorldMatrix(json, index, parentByNode));
  const positions = [];
  const normals = [];
  const indices = [];
  const primitives = [];
  for (let nodeIndex = 0; nodeIndex < (json.nodes?.length ?? 0); nodeIndex += 1) {
    const node = json.nodes[nodeIndex];
    if (node.mesh == null) continue;
    const mesh = json.meshes[node.mesh];
    for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex += 1) {
      const primitive = mesh.primitives[primitiveIndex];
      if ((primitive.mode ?? 4) !== 4) continue;
      const sourcePositions = readAccessor(glb, primitive.attributes.POSITION);
      const sourceNormals = primitive.attributes.NORMAL == null ? null : readAccessor(glb, primitive.attributes.NORMAL);
      const sourceIndices = primitive.indices == null
        ? Array.from({ length: sourcePositions.length / 3 }, (_, index) => index)
        : Array.from(readAccessor(glb, primitive.indices));
      const matrix = nodeMatrices[nodeIndex];
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const vertexOffset = positions.length / 3;
      for (let index = 0; index < sourcePositions.length; index += 3) {
        const point = new THREE.Vector3(sourcePositions[index], sourcePositions[index + 1], sourcePositions[index + 2]).applyMatrix4(matrix);
        positions.push(point.x, point.y, point.z);
        if (sourceNormals) {
          const normal = new THREE.Vector3(sourceNormals[index], sourceNormals[index + 1], sourceNormals[index + 2]).applyNormalMatrix(normalMatrix);
          normals.push(normal.x, normal.y, normal.z);
        }
      }
      indices.push(...sourceIndices.map((index) => index + vertexOffset));
      primitives.push({
        nodeIndex,
        meshIndex: node.mesh,
        primitiveIndex,
        indexed: primitive.indices != null,
        vertexCount: sourcePositions.length / 3,
        indexCount: sourceIndices.length,
        triangleCount: sourceIndices.length / 3,
        material: primitive.material ?? null,
        mode: primitive.mode ?? 4
      });
    }
  }
  return { positions: Float64Array.from(positions), normals: Float64Array.from(normals), indices: Uint32Array.from(indices), primitives };
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const binary = glb.binaryChunks[view.buffer ?? 0];
  const component = componentInfo(accessor.componentType);
  const itemSize = typeSize(accessor.type);
  const stride = view.byteStride ?? component.bytes * itemSize;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const output = new component.ArrayType(accessor.count * itemSize);
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  for (let item = 0; item < accessor.count; item += 1) {
    for (let channel = 0; channel < itemSize; channel += 1) {
      output[item * itemSize + channel] = dataView[component.reader](start + item * stride + channel * component.bytes, true);
    }
  }
  return output;
}

function componentInfo(componentType) {
  const types = {
    5120: { ArrayType: Int8Array, reader: "getInt8", bytes: 1 },
    5121: { ArrayType: Uint8Array, reader: "getUint8", bytes: 1 },
    5122: { ArrayType: Int16Array, reader: "getInt16", bytes: 2 },
    5123: { ArrayType: Uint16Array, reader: "getUint16", bytes: 2 },
    5125: { ArrayType: Uint32Array, reader: "getUint32", bytes: 4 },
    5126: { ArrayType: Float32Array, reader: "getFloat32", bytes: 4 }
  };
  const result = types[componentType];
  if (!result) throw new Error(`Unsupported accessor component type ${componentType}.`);
  return result;
}

function typeSize(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type] ?? 1;
}

function resolveNodeWorldMatrix(json, nodeIndex, parentByNode) {
  const matrices = [];
  let current = nodeIndex;
  while (current != null) {
    matrices.unshift(nodeLocalMatrix(json.nodes[current]));
    current = parentByNode.get(current);
  }
  return matrices.reduce((world, local) => world.multiply(local), new THREE.Matrix4());
}

function nodeLocalMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1])
  );
}

function calculateBounds(positions) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.length; index += 3) box.expandByPoint(point.set(positions[index], positions[index + 1], positions[index + 2]));
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  let radialMin = Infinity;
  let radialMax = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const radius = point.set(positions[index], positions[index + 1], positions[index + 2]).distanceTo(sphere.center);
    radialMin = Math.min(radialMin, radius);
    radialMax = Math.max(radialMax, radius);
  }
  return {
    boxMin: box.min.toArray(),
    boxMax: box.max.toArray(),
    boxCenter: box.getCenter(new THREE.Vector3()).toArray(),
    boxSize: box.getSize(new THREE.Vector3()).toArray(),
    sphereCenter: sphere.center.toArray(),
    sphereRadius: radialMax,
    conservativeAabbSphereRadius: sphere.radius,
    radialMin,
    radialMax
  };
}

function weldPositions(source, tolerance) {
  const originalCount = source.length / 3;
  const originalToWelded = new Uint32Array(originalCount);
  const positions = [];
  const exact = new Map();
  const grid = new Map();
  const inverse = tolerance > 0 ? 1 / tolerance : 0;
  for (let index = 0; index < originalCount; index += 1) {
    const x = source[index * 3];
    const y = source[index * 3 + 1];
    const z = source[index * 3 + 2];
    let weldedIndex = -1;
    if (tolerance === 0) {
      const key = `${x}|${y}|${z}`;
      weldedIndex = exact.get(key) ?? -1;
      if (weldedIndex < 0) exact.set(key, positions.length / 3);
    } else {
      const cx = Math.floor(x * inverse);
      const cy = Math.floor(y * inverse);
      const cz = Math.floor(z * inverse);
      const toleranceSq = tolerance * tolerance;
      outer: for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const candidates = grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? [];
            for (const candidate of candidates) {
              const px = positions[candidate * 3];
              const py = positions[candidate * 3 + 1];
              const pz = positions[candidate * 3 + 2];
              if ((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 <= toleranceSq) {
                weldedIndex = candidate;
                break outer;
              }
            }
          }
        }
      }
      if (weldedIndex < 0) {
        const key = `${cx},${cy},${cz}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(positions.length / 3);
        grid.set(key, bucket);
      }
    }
    if (weldedIndex < 0) {
      weldedIndex = positions.length / 3;
      positions.push(x, y, z);
    }
    originalToWelded[index] = weldedIndex;
  }
  return { tolerance, positions: Float64Array.from(positions), originalToWelded, originalCount, weldedCount: positions.length / 3 };
}

function analyzeTopology(geometry, welded) {
  const edges = new Map();
  const usedVertices = new Set();
  const degenerateTriangles = [];
  const triangleCount = geometry.indices.length / 3;
  for (let face = 0; face < triangleCount; face += 1) {
    const a = welded.originalToWelded[geometry.indices[face * 3]];
    const b = welded.originalToWelded[geometry.indices[face * 3 + 1]];
    const c = welded.originalToWelded[geometry.indices[face * 3 + 2]];
    usedVertices.add(a); usedVertices.add(b); usedVertices.add(c);
    if (a === b || b === c || c === a) degenerateTriangles.push(face);
    addEdge(edges, a, b, face);
    addEdge(edges, b, c, face);
    addEdge(edges, c, a, face);
  }
  const boundaryEdges = [...edges.values()].filter((edge) => edge.faces.length === 1);
  const nonManifoldEdges = [...edges.values()].filter((edge) => edge.faces.length > 2);
  const boundaryPaths = chainEdges(boundaryEdges);
  const triangleComponents = countTriangleComponents(triangleCount, edges);
  return {
    edges,
    boundaryEdges,
    nonManifoldEdges,
    boundaryPaths,
    triangleComponents,
    degenerateTriangles,
    isolatedVertexCount: welded.weldedCount - usedVertices.size
  };
}

function addEdge(edges, a, b, face) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const key = `${low}|${high}`;
  const edge = edges.get(key) ?? { key, a: low, b: high, faces: [] };
  edge.faces.push(face);
  edges.set(key, edge);
}

function countTriangleComponents(triangleCount, edges) {
  const parent = new Uint32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) parent[index] = index;
  const find = (value) => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (const edge of edges.values()) for (let index = 1; index < edge.faces.length; index += 1) union(edge.faces[0], edge.faces[index]);
  const sizes = new Map();
  for (let face = 0; face < triangleCount; face += 1) sizes.set(find(face), (sizes.get(find(face)) ?? 0) + 1);
  return [...sizes.values()].sort((a, b) => b - a);
}

function chainEdges(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    addNeighbor(adjacency, edge.a, edge.b, edge.key);
    addNeighbor(adjacency, edge.b, edge.a, edge.key);
  }
  const unused = new Set(edges.map((edge) => edge.key));
  const paths = [];
  while (unused.size) {
    const seedKey = unused.values().next().value;
    const seed = edges.find((edge) => edge.key === seedKey);
    const componentVertices = collectGraphComponent(seed.a, adjacency);
    const endpoints = componentVertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) !== 2);
    let start = endpoints[0] ?? seed.a;
    const points = [start];
    let previous = null;
    let current = start;
    while (true) {
      const nextEntry = (adjacency.get(current) ?? []).find((entry) => entry.vertex !== previous && unused.has(entry.edgeKey));
      if (!nextEntry) break;
      unused.delete(nextEntry.edgeKey);
      previous = current;
      current = nextEntry.vertex;
      points.push(current);
      if (current === start) break;
    }
    if (points.length > 1) paths.push({
      vertices: points,
      closed: points[0] === points.at(-1),
      branchVertexCount: componentVertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) > 2).length
    });
    else unused.delete(seedKey);
  }
  return paths;
}

function addNeighbor(adjacency, a, b, edgeKey) {
  const entries = adjacency.get(a) ?? [];
  entries.push({ vertex: b, edgeKey });
  adjacency.set(a, entries);
}

function collectGraphComponent(seed, adjacency) {
  const visited = new Set([seed]);
  const queue = [seed];
  while (queue.length) {
    const current = queue.shift();
    for (const { vertex } of adjacency.get(current) ?? []) {
      if (visited.has(vertex)) continue;
      visited.add(vertex);
      queue.push(vertex);
    }
  }
  return [...visited];
}

function analyzeOrientation(geometry) {
  const faceScores = new Float64Array(geometry.indices.length / 3);
  const faceAreas = new Float64Array(faceScores.length);
  const storedNormalAgreement = new Float64Array(faceScores.length);
  const centroidRadii = new Float64Array(faceScores.length);
  const maximumEdgeLengths = new Float64Array(faceScores.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const stored = new THREE.Vector3();
  let zeroAreaTriangleCount = 0;
  for (let face = 0; face < faceScores.length; face += 1) {
    readPoint(geometry.positions, geometry.indices[face * 3], a);
    readPoint(geometry.positions, geometry.indices[face * 3 + 1], b);
    readPoint(geometry.positions, geometry.indices[face * 3 + 2], c);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    const doubleArea = normal.length();
    faceAreas[face] = doubleArea * 0.5;
    if (doubleArea <= 1e-12) {
      zeroAreaTriangleCount += 1;
      faceScores[face] = 0;
      continue;
    }
    normal.multiplyScalar(1 / doubleArea);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    centroidRadii[face] = centroid.length();
    maximumEdgeLengths[face] = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    faceScores[face] = normal.dot(centroid.normalize());
    if (geometry.normals.length) {
      stored.set(0, 0, 0);
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = geometry.indices[face * 3 + corner];
        stored.x += geometry.normals[vertexIndex * 3];
        stored.y += geometry.normals[vertexIndex * 3 + 1];
        stored.z += geometry.normals[vertexIndex * 3 + 2];
      }
      stored.normalize();
      storedNormalAgreement[face] = normal.dot(stored);
    }
  }
  return { faceScores, faceAreas, storedNormalAgreement, centroidRadii, maximumEdgeLengths, zeroAreaTriangleCount };
}

function analyzeRimAttempt({ attempt, welded, topology, faceScores }) {
  const candidates = [];
  for (const edge of topology.edges.values()) {
    if (edge.faces.length !== 2) continue;
    const first = faceScores[edge.faces[0]];
    const second = faceScores[edge.faces[1]];
    const differs = (first >= attempt.terrainMin && second <= attempt.otherMax)
      || (second >= attempt.terrainMin && first <= attempt.otherMax);
    if (differs) candidates.push(edge);
  }
  const paths = chainEdges(candidates);
  const pathSummary = summarizeVertexPaths(paths, welded.positions);
  const regionMatches = matchValidationRegions(paths, welded.positions);
  return {
    ...attempt,
    candidateEdgeCount: candidates.length,
    paths,
    ...pathSummary,
    regionMatches,
    totalMatchedRegions: Object.values(regionMatches).filter((matches) => matches.length).length
  };
}

function classifyRadialLayers(geometry, welded) {
  const directions = new Float64Array(welded.positions.length);
  const radii = new Float64Array(welded.weldedCount);
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < welded.weldedCount; vertex += 1) {
    readPoint(welded.positions, vertex, point);
    radii[vertex] = point.length();
    point.normalize();
    directions[vertex * 3] = point.x;
    directions[vertex * 3 + 1] = point.y;
    directions[vertex * 3 + 2] = point.z;
  }
  const directionWeld = weldPositions(directions, 2e-6);
  const groups = Array.from({ length: directionWeld.weldedCount }, () => []);
  for (let vertex = 0; vertex < welded.weldedCount; vertex += 1) groups[directionWeld.originalToWelded[vertex]].push(vertex);
  const vertexClasses = new Uint8Array(welded.weldedCount);
  let pairedDirectionGroupCount = 0;
  let singletonDirectionGroupCount = 0;
  let maximumRadialSpan = 0;
  for (const group of groups) {
    const groupRadii = group.map((vertex) => radii[vertex]);
    const minRadius = Math.min(...groupRadii);
    const maxRadius = Math.max(...groupRadii);
    const span = maxRadius - minRadius;
    maximumRadialSpan = Math.max(maximumRadialSpan, span);
    if (span > 1e-4) pairedDirectionGroupCount += 1;
    else singletonDirectionGroupCount += 1;
    for (const vertex of group) {
      if (span <= 1e-4) vertexClasses[vertex] = 0;
      else if (radii[vertex] >= maxRadius - 1e-5) vertexClasses[vertex] = 1;
      else if (radii[vertex] <= minRadius + 1e-5) vertexClasses[vertex] = 2;
      else vertexClasses[vertex] = 3;
    }
  }
  const faceClasses = [];
  const faceVertices = [];
  for (let face = 0; face < geometry.indices.length / 3; face += 1) {
    const vertices = [0, 1, 2].map((corner) => welded.originalToWelded[geometry.indices[face * 3 + corner]]);
    const classes = vertices.map((vertex) => vertexClasses[vertex]);
    const faceClass = classes.every((value) => value === 1)
      ? "top"
      : classes.every((value) => value === 2)
        ? "underside"
        : classes.some((value) => value === 1) && classes.some((value) => value === 2)
          ? "wall"
          : "unclassified";
    faceClasses.push(faceClass);
    faceVertices.push(vertices);
  }
  return {
    directionWeldTolerance: directionWeld.tolerance,
    directionGroupCount: directionWeld.weldedCount,
    pairedDirectionGroupCount,
    singletonDirectionGroupCount,
    maximumRadialSpan,
    radialPercentiles: Object.fromEntries([0, 1, 5, 25, 50, 75, 95, 99, 100].map((value) => [value, percentileValue(radii, value / 100)])),
    vertexClassCounts: countLabels([...vertexClasses].map((value) => ["unclassified", "outer", "inner", "intermediate"][value])),
    faceClassCounts: countLabels(faceClasses),
    vertexClasses,
    faceClasses,
    faceVertices,
    radii
  };
}

function analyzeStructuralRim({ welded, topology, radialLayers }) {
  const candidates = [];
  const openTopEdges = [];
  const nonManifoldTopWallEdges = [];
  for (const edge of topology.edges.values()) {
    const classes = edge.faces.map((face) => radialLayers.faceClasses[face]);
    const hasTop = classes.includes("top");
    const hasWall = classes.includes("wall");
    const endpointsOuter = radialLayers.vertexClasses[edge.a] === 1 && radialLayers.vertexClasses[edge.b] === 1;
    if (edge.faces.length === 2 && hasTop && hasWall && endpointsOuter) candidates.push(edge);
    if (edge.faces.length === 1 && hasTop && endpointsOuter) openTopEdges.push(edge);
    if (edge.faces.length > 2 && hasTop && hasWall && endpointsOuter) nonManifoldTopWallEdges.push(edge);
  }
  const allCandidates = [...candidates, ...openTopEdges, ...nonManifoldTopWallEdges];
  const paths = chainEdges(allCandidates);
  return {
    id: "structural-outer-top-to-wall",
    terrainMin: null,
    otherMax: null,
    candidateEdgeCount: allCandidates.length,
    sharedTopWallEdgeCount: candidates.length,
    openTopEdgeCount: openTopEdges.length,
    nonManifoldTopWallEdgeCount: nonManifoldTopWallEdges.length,
    paths,
    ...summarizeVertexPaths(paths, welded.positions),
    regionMatches: matchValidationRegions(paths, welded.positions),
    totalMatchedRegions: 0
  };
}

function stripRadialLayerDetails(radialLayers) {
  const { vertexClasses: _vertexClasses, faceClasses: _faceClasses, faceVertices: _faceVertices, radii: _radii, ...summary } = radialLayers;
  return summary;
}

function summarizeTopology(tolerance, welded, topology, { includePathDetails = true } = {}) {
  const one = topology.boundaryEdges.length;
  const two = [...topology.edges.values()].filter((edge) => edge.faces.length === 2).length;
  const more = topology.nonManifoldEdges.length;
  return {
    tolerance,
    originalVertexCount: welded.originalCount,
    weldedVertexCount: welded.weldedCount,
    duplicatePositionVertexCount: welded.originalCount - welded.weldedCount,
    edgeCount: topology.edges.size,
    oneTriangleEdgeCount: one,
    twoTriangleEdgeCount: two,
    moreThanTwoTriangleEdgeCount: more,
    nonManifoldEdgeCount: more,
    nonManifoldPathCount: chainEdges(topology.nonManifoldEdges).length,
    nonManifoldPaths: includePathDetails ? summarizeVertexPathLocations(chainEdges(topology.nonManifoldEdges), welded.positions) : undefined,
    isolatedVertexCount: topology.isolatedVertexCount,
    degenerateTriangleCountAfterWeld: topology.degenerateTriangles.length,
    connectedTriangleIslandCount: topology.triangleComponents.length,
    connectedTriangleIslandSizes: topology.triangleComponents,
    boundaryPathCount: topology.boundaryPaths.length,
    boundaryClosedLoopCount: topology.boundaryPaths.filter((path) => path.closed).length,
    boundaryOpenPathCount: topology.boundaryPaths.filter((path) => !path.closed).length,
    boundaryLoopLengthsInEdges: includePathDetails ? topology.boundaryPaths.map((path) => path.vertices.length - 1).sort((a, b) => b - a) : undefined,
    boundaryPaths: includePathDetails ? summarizeVertexPathLocations(topology.boundaryPaths, welded.positions) : undefined
  };
}

function summarizeOrientation(orientation) {
  const buckets = [
    { id: "0.75_to_1.00", min: 0.75, max: Infinity },
    { id: "0.25_to_0.75", min: 0.25, max: 0.75 },
    { id: "-0.25_to_0.25", min: -0.25, max: 0.25 },
    { id: "-0.75_to_-0.25", min: -0.75, max: -0.25 },
    { id: "-1.00_to_-0.75", min: -Infinity, max: -0.75 }
  ];
  return {
    triangleCount: orientation.faceScores.length,
    zeroAreaTriangleCount: orientation.zeroAreaTriangleCount,
    buckets: Object.fromEntries(buckets.map((bucket) => [bucket.id, countRange(orientation.faceScores, bucket.min, bucket.max)])),
    percentiles: Object.fromEntries([0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 100].map((percentile) => [percentile, percentileValue(orientation.faceScores, percentile / 100)])),
    storedNormalAgreementBelowZero: [...orientation.storedNormalAgreement].filter((value) => value < 0).length,
    storedNormalAgreementBelow099: [...orientation.storedNormalAgreement].filter((value) => value < 0.99).length,
    metricsByOrientationBucket: Object.fromEntries(buckets.map((bucket) => [bucket.id, summarizeFaceMetricBucket(orientation, bucket.min, bucket.max)])),
    surfaceClassification: {
      outwardTerrainScoreGte075: [...orientation.faceScores].filter((score) => score >= 0.75).length,
      slopedTerrainScore025To075: [...orientation.faceScores].filter((score) => score >= 0.25 && score < 0.75).length,
      nearVerticalAbsScoreLt025: [...orientation.faceScores].filter((score) => Math.abs(score) < 0.25).length,
      inwardUndersideScoreLteNeg025: [...orientation.faceScores].filter((score) => score <= -0.25).length
    }
  };
}

function summarizeFaceMetricBucket(orientation, min, max) {
  const indices = [...orientation.faceScores].map((score, index) => ({ score, index })).filter(({ score }) => score >= min && score < max).map(({ index }) => index);
  const summarize = (values) => indices.length ? {
    min: Math.min(...indices.map((index) => values[index])),
    median: percentileValue(indices.map((index) => values[index]), 0.5),
    max: Math.max(...indices.map((index) => values[index]))
  } : null;
  return {
    count: indices.length,
    centroidRadius: summarize(orientation.centroidRadii),
    area: summarize(orientation.faceAreas),
    maximumEdgeLength: summarize(orientation.maximumEdgeLengths)
  };
}

function stripRimPaths(attempt) {
  const { paths: _paths, ...summary } = attempt;
  return summary;
}

function summarizeVertexPaths(paths, positions) {
  let totalLength = 0;
  let branchVertexCount = 0;
  for (const path of paths) {
    totalLength += pathLength(path.vertices, positions);
    branchVertexCount += path.branchVertexCount ?? 0;
  }
  return {
    connectedPathCount: paths.length,
    closedPathCount: paths.filter((path) => path.closed).length,
    openPathCount: paths.filter((path) => !path.closed).length,
    branchVertexCount,
    totalPathLength: totalLength,
    pathPointCounts: paths.map((path) => path.vertices.length).sort((a, b) => b - a),
    pathLocations: summarizeVertexPathLocations(paths, positions)
  };
}

function summarizeVertexPathLocations(paths, positions) {
  return paths.map((path, index) => {
    const geo = path.vertices.map((vertex) => localToGeo(readPoint(positions, vertex, new THREE.Vector3())));
    return { index, closed: path.closed, pointCount: path.vertices.length, ...geoBounds(geo) };
  });
}

function matchValidationRegions(paths, positions) {
  return Object.fromEntries(Object.entries(VALIDATION_REGIONS).map(([id, region]) => {
    const matches = [];
    paths.forEach((path, pathIndex) => {
      const geo = path.vertices.map((vertex) => localToGeo(readPoint(positions, vertex, new THREE.Vector3())));
      const inside = geo.filter((point) => pointInRegion(point, region)).length;
      if (inside >= Math.min(3, Math.ceil(geo.length * 0.25))) {
        matches.push({ pathIndex, pointCount: path.vertices.length, closed: path.closed, insidePointCount: inside, ...geoBounds(geo) });
      }
    });
    return [id, matches];
  }));
}

function buildRadialLandMask({ width, height, geometry, faceScores, terrainMin }) {
  const pixels = new Uint8Array(width * height);
  const depth = new Float32Array(width * height);
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let face = 0; face < faceScores.length; face += 1) {
    if (faceScores[face] <= terrainMin) continue;
    for (let corner = 0; corner < 3; corner += 1) readPoint(geometry.positions, geometry.indices[face * 3 + corner], points[corner]);
    rasterizeSphericalTriangle(points, pixels, depth, width, height);
  }
  return { width, height, pixels, depth, terrainMin, landPixelCount: pixels.reduce((sum, value) => sum + value, 0) };
}

function rasterizeSphericalTriangle(points, pixels, depth, width, height) {
  const projected = points.map((point) => {
    const geo = localToGeo(point);
    return { x: ((geo.lng + 180) / 360) * width, y: ((90 - geo.lat) / 180) * height };
  });
  for (let index = 1; index < projected.length; index += 1) {
    while (projected[index].x - projected[0].x > width / 2) projected[index].x -= width;
    while (projected[index].x - projected[0].x < -width / 2) projected[index].x += width;
  }
  const minX = Math.floor(Math.min(...projected.map((point) => point.x))) - 2;
  const maxX = Math.ceil(Math.max(...projected.map((point) => point.x))) + 2;
  const minY = Math.max(0, Math.floor(Math.min(...projected.map((point) => point.y))) - 2);
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...projected.map((point) => point.y))) + 2);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const wrappedX = ((x % width) + width) % width;
      const direction = maskPixelToLocalDirection(wrappedX + 0.5, y + 0.5, width, height);
      const distance = rayTriangleDistance(direction, points[0], points[1], points[2]);
      if (distance == null) continue;
      const pixelIndex = y * width + wrappedX;
      if (distance <= depth[pixelIndex]) continue;
      pixels[pixelIndex] = 1;
      depth[pixelIndex] = distance;
    }
  }
}

function maskPixelToLocalDirection(x, y, width, height) {
  const lng = (x / width) * 360 - 180;
  const lat = 90 - (y / height) * 180;
  const placedLon = -lng;
  const lon = THREE.MathUtils.degToRad(placedLon + 90);
  const latRadians = THREE.MathUtils.degToRad(lat);
  const cosLat = Math.cos(latRadians);
  return new THREE.Vector3(cosLat * Math.cos(lon), Math.sin(latRadians), cosLat * Math.sin(lon));
}

function rayTriangleDistance(direction, a, b, c) {
  const edge1 = new THREE.Vector3().subVectors(b, a);
  const edge2 = new THREE.Vector3().subVectors(c, a);
  const p = new THREE.Vector3().crossVectors(direction, edge2);
  const determinant = edge1.dot(p);
  if (Math.abs(determinant) < 1e-10) return null;
  const inverse = 1 / determinant;
  const tVector = new THREE.Vector3().copy(a).multiplyScalar(-1);
  const u = tVector.dot(p) * inverse;
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const q = new THREE.Vector3().crossVectors(tVector, edge1);
  const v = direction.dot(q) * inverse;
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const distance = edge2.dot(q) * inverse;
  return distance > 0 ? distance : null;
}

function traceMaskBoundary(mask) {
  const edges = [];
  const { width, height, pixels } = mask;
  const isLand = (x, y) => y >= 0 && y < height && pixels[y * width + ((x % width) + width) % width] === 1;
  const add = (ax, ay, bx, by) => edges.push({ a: ay * (width + 1) + ax, b: by * (width + 1) + bx, key: `${Math.min(ay * (width + 1) + ax, by * (width + 1) + bx)}|${Math.max(ay * (width + 1) + ax, by * (width + 1) + bx)}` });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isLand(x, y)) continue;
      if (!isLand(x, y - 1)) add(x, y, x + 1, y);
      if (!isLand(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!isLand(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!isLand(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  return chainEdges(edges).map((path) => path.vertices.map((vertex) => ({ x: vertex % (width + 1), y: Math.floor(vertex / (width + 1)) })));
}

function summarizePaths(paths, width, height, maskCoordinates = false) {
  const normalized = paths.map((path) => path.points.map((point) => maskCoordinates
    ? { lng: (point.x / width) * 360 - 180, lat: 90 - (point.y / height) * 180 }
    : point));
  return {
    connectedPathCount: normalized.length,
    closedPathCount: paths.filter((path) => path.points.length > 2 && same2d(path.points[0], path.points.at(-1))).length,
    pathPointCounts: normalized.map((points) => points.length).sort((a, b) => b - a),
    pathLocations: normalized.slice(0, 100).map((points, index) => ({ index, pointCount: points.length, ...geoBounds(points) })),
    regionMatches: Object.fromEntries(Object.entries(VALIDATION_REGIONS).map(([id, region]) => [id, normalized
      .map((points, pathIndex) => ({ pathIndex, points }))
      .filter(({ points }) => points.filter((point) => pointInRegion(point, region)).length >= 3)
      .map(({ pathIndex, points }) => ({ pathIndex, pointCount: points.length, ...geoBounds(points) }))]))
  };
}

function buildMaskSimplificationReport(maskPaths, width, height) {
  const geoPaths = maskPaths.map((points) => points.map((point) => ({
    lng: (point.x / width) * 360 - 180,
    lat: 90 - (point.y / height) * 180
  })));
  const results = {};
  for (const [regionId, region] of Object.entries(VALIDATION_REGIONS)) {
    const runs = [];
    for (const geoPath of geoPaths) {
      const insideCount = geoPath.filter((point) => pointInRegion(point, region)).length;
      if (insideCount < 3) continue;
      const mostlyInside = insideCount / geoPath.length >= 0.65;
      if (mostlyInside) runs.push(geoPath);
      else runs.push(...clipGeoPathToRegion(geoPath, region));
    }
    const denseGeo = runs.sort((a, b) => b.length - a.length)[0];
    if (!denseGeo?.length) continue;
    const sourcePoints = denseGeo.map((point) => maskPixelToLocalDirection(((point.lng + 180) / 360) * width, ((90 - point.lat) / 180) * height, width, height).multiplyScalar(2.71));
    const closed = sourcePoints.length > 2 && sourcePoints[0].distanceTo(sourcePoints.at(-1)) < 0.02;
    results[regionId] = [0.005, 0.01, 0.02, 0.04].map((tolerance) => {
      const simplified = closed ? simplifyClosed3d(sourcePoints, tolerance) : rdp3d(sourcePoints, tolerance);
      return {
        tolerance,
        densePointCount: sourcePoints.length,
        simplifiedPointCount: simplified.length,
        maximumDeviation: maximumPolylineDeviation(sourcePoints, simplified),
        closed
      };
    });
  }
  return results;
}

function clipGeoPathToRegion(points, region) {
  const runs = [];
  let current = [];
  for (const point of points) {
    if (pointInRegion(point, region)) current.push(point);
    else if (current.length) { if (current.length >= 3) runs.push(current); current = []; }
  }
  if (current.length >= 3) runs.push(current);
  return runs;
}

function simplifyClosed3d(points, tolerance) {
  const working = points.length > 1 && points[0].distanceToSquared(points.at(-1)) < 1e-16 ? points.slice(0, -1) : [...points];
  if (working.length < 4) return points;
  let first = 0;
  let second = 1;
  let maxDistance = 0;
  for (let i = 0; i < working.length; i += 1) {
    for (let j = i + 1; j < working.length; j += 1) {
      const distance = working[i].distanceToSquared(working[j]);
      if (distance > maxDistance) { maxDistance = distance; first = i; second = j; }
    }
  }
  const chainA = cyclicSlice(working, first, second);
  const chainB = cyclicSlice(working, second, first);
  const combined = [...rdp3d(chainA, tolerance).slice(0, -1), ...rdp3d(chainB, tolerance).slice(0, -1)];
  combined.push(combined[0].clone());
  return combined;
}

function cyclicSlice(points, start, end) {
  const result = [points[start]];
  let index = start;
  while (index !== end) { index = (index + 1) % points.length; result.push(points[index]); }
  return result;
}

function rdp3d(points, tolerance) {
  if (points.length <= 2) return [...points];
  let maxDistance = -1;
  let split = -1;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistance(points[index], points[0], points.at(-1));
    if (distance > maxDistance) { maxDistance = distance; split = index; }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)];
  return [...rdp3d(points.slice(0, split + 1), tolerance).slice(0, -1), ...rdp3d(points.slice(split), tolerance)];
}

function maximumPolylineDeviation(source, simplified) {
  let maximum = 0;
  for (const point of source) {
    let minimum = Infinity;
    for (let index = 1; index < simplified.length; index += 1) minimum = Math.min(minimum, pointSegmentDistance(point, simplified[index - 1], simplified[index]));
    maximum = Math.max(maximum, minimum);
  }
  return maximum;
}

function pointSegmentDistance(point, a, b) {
  const segment = new THREE.Vector3().subVectors(b, a);
  const lengthSq = segment.lengthSq();
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(new THREE.Vector3().subVectors(point, a).dot(segment) / lengthSq, 0, 1) : 0;
  return point.distanceTo(new THREE.Vector3().copy(a).addScaledVector(segment, t));
}

function buildDiagnosticAsset({ selectedRim, welded, topology, geometry, faceScores, maskPaths, maskWidth, maskHeight }) {
  const toPath = (path) => path.vertices.map((vertex) => [
    round(welded.positions[vertex * 3]),
    round(welded.positions[vertex * 3 + 1]),
    round(welded.positions[vertex * 3 + 2])
  ]);
  const nonManifoldPaths = chainEdges(topology.nonManifoldEdges);
  const rejectedInternal = [];
  for (const edge of topology.edges.values()) {
    if (edge.faces.length !== 2) continue;
    const [a, b] = edge.faces.map((face) => faceScores[face]);
    if (a >= 0.75 && b >= 0.75 && Math.abs(a - b) >= 0.2) rejectedInternal.push(edge);
  }
  return {
    version: 1,
    source: "/assets/globe/models/land.glb",
    weldTolerance: welded.tolerance,
    selectedThreshold: { id: selectedRim.id, terrainMin: selectedRim.terrainMin, otherMax: selectedRim.otherMax },
    layers: {
      terrainWallRim: selectedRim.paths.map(toPath),
      radialSilhouette: maskPaths.map((points) => points.map((point) => {
        const direction = maskPixelToLocalDirection(point.x, point.y, maskWidth, maskHeight).multiplyScalar(2.715);
        return [round(direction.x), round(direction.y), round(direction.z)];
      })),
      openEdges: topology.boundaryPaths.map(toPath),
      nonManifoldEdges: nonManifoldPaths.map(toPath),
      rejectedInternalEdges: chainEdges(rejectedInternal).map(toPath)
    },
    faceClassification: {
      terrain: [...faceScores].filter((score) => score >= 0.75).length,
      slope: [...faceScores].filter((score) => score >= 0.25 && score < 0.75).length,
      wall: [...faceScores].filter((score) => Math.abs(score) < 0.25).length,
      underside: [...faceScores].filter((score) => score <= -0.25).length
    },
    triangleCount: geometry.indices.length / 3
  };
}

function countLabels(labels) {
  const counts = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  return counts;
}

function summarizeGlb(glb, geometry, bounds) {
  const parentByNode = new Map();
  glb.json.nodes?.forEach((node, index) => node.children?.forEach((child) => parentByNode.set(child, index)));
  return {
    asset: glb.json.asset,
    extensionsUsed: glb.json.extensionsUsed ?? [],
    sceneCount: glb.json.scenes?.length ?? 0,
    defaultScene: glb.json.scene ?? 0,
    nodeCount: glb.json.nodes?.length ?? 0,
    meshCount: glb.json.meshes?.length ?? 0,
    primitiveCount: geometry.primitives.length,
    materialCount: glb.json.materials?.length ?? 0,
    vertexCount: geometry.positions.length / 3,
    indexedPrimitiveCount: geometry.primitives.filter((primitive) => primitive.indexed).length,
    nonIndexedPrimitiveCount: geometry.primitives.filter((primitive) => !primitive.indexed).length,
    triangleCount: geometry.indices.length / 3,
    primitives: geometry.primitives,
    nodes: (glb.json.nodes ?? []).map((node, index) => ({
      index,
      name: node.name ?? null,
      mesh: node.mesh ?? null,
      parent: parentByNode.get(index) ?? null,
      children: node.children ?? [],
      localTransform: {
        matrix: nodeLocalMatrix(node).toArray(),
        translation: node.translation ?? [0, 0, 0],
        rotation: node.rotation ?? [0, 0, 0, 1],
        scale: node.scale ?? [1, 1, 1]
      },
      worldMatrix: resolveNodeWorldMatrix(glb.json, index, parentByNode).toArray()
    })),
    materials: glb.json.materials ?? [],
    bounds
  };
}

function readPoint(positions, index, target) {
  return target.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
}

function pathLength(vertices, positions) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let total = 0;
  for (let index = 1; index < vertices.length; index += 1) total += readPoint(positions, vertices[index - 1], a).distanceTo(readPoint(positions, vertices[index], b));
  return total;
}

function localToGeo(point) {
  const normalized = point.clone().normalize();
  return {
    lng: wrapDegrees(-(THREE.MathUtils.radToDeg(Math.atan2(normalized.z, normalized.x)) - 90)),
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normalized.y, -1, 1)))
  };
}

function geoBounds(points) {
  if (!points.length) return { lonMin: null, lonMax: null, latMin: null, latMax: null, centerLng: null, centerLat: null };
  let sin = 0;
  let cos = 0;
  let latTotal = 0;
  for (const point of points) { const radians = THREE.MathUtils.degToRad(point.lng); sin += Math.sin(radians); cos += Math.cos(radians); latTotal += point.lat; }
  const centerLng = THREE.MathUtils.radToDeg(Math.atan2(sin, cos));
  const unwrapped = points.map((point) => centerLng + wrapDegrees(point.lng - centerLng));
  return {
    lonMin: Math.min(...unwrapped),
    lonMax: Math.max(...unwrapped),
    latMin: Math.min(...points.map((point) => point.lat)),
    latMax: Math.max(...points.map((point) => point.lat)),
    centerLng: wrapDegrees(centerLng),
    centerLat: latTotal / points.length
  };
}

function pointInRegion(point, region) {
  return point.lng >= region.lon[0] && point.lng <= region.lon[1] && point.lat >= region.lat[0] && point.lat <= region.lat[1];
}

function countRange(values, min, max) {
  return [...values].filter((value) => value >= min && value < max).length;
}

function percentileValue(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function same2d(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function wrapDegrees(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function round(value) {
  return Math.round(value * 1e7) / 1e7;
}

function relativePath(filePath) {
  return path.relative(ROOT_DIR, filePath).replaceAll("\\", "/");
}
