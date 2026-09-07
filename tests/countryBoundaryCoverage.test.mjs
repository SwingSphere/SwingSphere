import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveActivityBoundaryCoverage } from "../src/features/globe/runtime/CountryVectorActivityLayer.js";

const productionPageSource = readFileSync(
  new URL("../components/ProductionGlobePage.tsx", import.meta.url),
  "utf8"
);
const vectorActivitySource = readFileSync(
  new URL("../src/features/globe/runtime/CountryVectorActivityLayer.js", import.meta.url),
  "utf8"
);
const manifest = JSON.parse(readFileSync(
  new URL("../public/assets/globe/borders/hybrid/v1/manifest.json", import.meta.url),
  "utf8"
));
const countries = JSON.parse(readFileSync(
  new URL("../public/geo/countries.json", import.meta.url),
  "utf8"
));

test("active-country boundary coverage requires drawable hybrid or GeoJSON geometry", () => {
  const countryGroups = new Map([
    ["USA", { sourceType: "hybrid", lines: [{}] }],
    ["ROU", { sourceType: "geojson-fallback", lines: [{}] }],
    ["SRB", { sourceType: "presentation-group", lines: [] }],
  ]);

  assert.deepEqual(
    resolveActivityBoundaryCoverage(["USA", "ROU", "SRB", "MCO"], countryGroups),
    {
      requestedCountryKeys: ["USA", "ROU", "SRB", "MCO"],
      resolvedCountryKeys: ["USA", "ROU"],
      unresolvedCountryKeys: ["SRB", "MCO"],
    }
  );
});

test("production does not suppress individual Adriatic or Balkan borders", () => {
  assert.doesNotMatch(productionPageSource, /ADRIATIC_BALKANS_PRESENTATION_GROUP|suppressVectorBorders/);
  assert.doesNotMatch(vectorActivitySource, /suppressedCountryKeys|sourceType:\s*["']presentation-group["']/);
});

test("Serbia has both hybrid and authoritative GeoJSON boundary sources", () => {
  assert.equal(manifest.countries?.SRB?.url, "/assets/globe/borders/hybrid/v1/srb.json");
  assert.ok(
    countries.features.some((feature) => {
      const properties = feature?.properties ?? {};
      return [properties.ISO_A3, properties.ADM0_A3, properties.SOV_A3]
        .some((value) => String(value ?? "").toUpperCase() === "SRB");
    }),
    "Serbia must remain available through the authoritative GeoJSON fallback."
  );
});

test("runtime reports any active country that produces no drawable boundary", () => {
  assert.match(vectorActivitySource, /#reportBoundaryCoverage\(\)/);
  assert.match(
    vectorActivitySource,
    /Active countries without a drawable hybrid or GeoJSON boundary/
  );
  assert.match(
    vectorActivitySource,
    /this\.manifest\s*=\s*await loadJsonAsset\(this\.manifestUrl\)\.catch/
  );
  assert.doesNotMatch(
    vectorActivitySource,
    /if \(!this\.manifest \|\| this\.disposed\) return/
  );
});
