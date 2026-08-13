
const listings = [
  { name: "Twist", lat: 37.8067, lon: -122.4132, city: "San Francisco" },
  { name: "The Power Exchange", lat: 37.7833, lon: -122.4132, city: "San Francisco" },
  { name: "Oakland Venue", lat: 37.8044, lon: -122.2712, city: "Oakland" },
  { name: "San Jose Venue", lat: 37.3382, lon: -121.8863, city: "San Jose" },
  { name: "Santa Cruz Venue", lat: 36.9741, lon: -122.0308, city: "Santa Cruz" }
];

const spreadConfig = {
  enabled: true,
  innerRadiusDeg: 1.1,
  ringStepDeg: 0.6,
  ringCapacity: 8
};

// Mocking buildRegionalDisplayCoordinates from PinManager.js
function buildRegionalDisplayCoordinates(events, config) {
  const coordinates = new Map();
  if (!config.enabled) return coordinates;
  const groups = new Map();
  for (const event of events) {
    const city = (event.city || "").trim().toLowerCase();
    const key = city || event.name;
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }

  const ringCapacity = config.ringCapacity || 8;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name));
    const centerLat = sorted.reduce((sum, e) => sum + e.lat, 0) / sorted.length;
    const centerLon = sorted.reduce((sum, e) => sum + e.lon, 0) / sorted.length;
    const longitudeScale = Math.max(Math.cos(centerLat * Math.PI / 180), 0.35);
    
    for (let i = 0; i < sorted.length; i++) {
      const ring = Math.floor(i / ringCapacity);
      const ringStart = ring * ringCapacity;
      const ringCount = Math.min(ringCapacity, sorted.length - ringStart);
      const slot = i - ringStart;
      const angle = (slot / ringCount) * Math.PI * 2 - Math.PI * 0.5;
      const radius = config.innerRadiusDeg + ring * config.ringStepDeg;
      const event = sorted[i];
      coordinates.set(event.name, {
        lat: centerLat + Math.cos(angle) * radius,
        lon: centerLon + (Math.sin(angle) * radius) / longitudeScale
      });
    }
  }
  return coordinates;
}

const renderCoords = buildRegionalDisplayCoordinates(listings, spreadConfig);

console.log("### Audit Results");
console.log("");
console.log("#### True Coordinates");
listings.forEach(l => {
  console.log(`- **${l.name}**: ${l.lat.toFixed(4)}, ${l.lon.toFixed(4)} (City: ${l.city})`);
});

console.log("");
console.log("#### Regional Render Coordinates");
listings.forEach(l => {
  const rc = renderCoords.get(l.name) || { lat: l.lat, lon: l.lon };
  console.log(`- **${l.name}**: ${rc.lat.toFixed(4)}, ${rc.lon.toFixed(4)} ${renderCoords.has(l.name) ? '(Spread applied)' : '(No spread - single city member)'}`);
});

console.log("");
console.log("#### Separation Analysis");

function getDist(p1, p2) {
    const dLat = p1.lat - p2.lat;
    const dLon = p1.lon - p2.lon;
    return Math.sqrt(dLat*dLat + dLon*dLon);
}

const finalCoords = listings.map(l => ({ name: l.name, ...(renderCoords.get(l.name) || { lat: l.lat, lon: l.lon }) }));

console.log("- **Distance Matrix (Degrees)**:");
for (let i = 0; i < finalCoords.length; i++) {
    for (let j = i + 1; j < finalCoords.length; j++) {
        const d = getDist(finalCoords[i], finalCoords[j]);
        if (i !== j) {
           console.log(`  - ${finalCoords[i].name} <-> ${finalCoords[j].name}: ${d.toFixed(4)}°`);
        }
    }
}

console.log("");
console.log("#### Findings");
console.log("1. **Twist and The Power Exchange** are spread because they share the city 'San Francisco'. Separation: " + getDist(finalCoords[0], finalCoords[1]).toFixed(4) + "°");
console.log("2. **Oakland, San Jose, Santa Cruz** are NOT spread relative to each other or SF because they have different city names.");
console.log("3. **Oakland and SF (Twist)** are only " + getDist(finalCoords[0], finalCoords[2]).toFixed(4) + "° apart, which is very dense at regional scale.");
console.log("4. **Spiderfy Goal**: Group SF and Oakland into one cluster for local spreading, while keeping San Jose and Santa Cruz distinct but also spread if they overlap with anything else.");
