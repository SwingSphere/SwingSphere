import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const LAND_PATH = path.join(ROOT_DIR, "public/assets/globe/models/land.glb");
const GEOJSON_PATH = path.join(ROOT_DIR, "public/geo/publicgeocountries-simplified-35.json");
const FULL_GEOJSON_PATH = path.join(ROOT_DIR, "public/geo/countries.json");
const ID_ATLAS_PATH = path.join(ROOT_DIR, "public/assets/globe/textures/countryIdTexture.png");
const LOOKUP_PATH = path.join(ROOT_DIR, "public/assets/globe/data/countryLookup.json");
const COASTLINE_DIR = path.join(ROOT_DIR, "public/assets/globe/coastlines");
const HYBRID_DIR = path.join(ROOT_DIR, "public/assets/globe/borders/hybrid/v1");
const AUDIT_DIR = path.join(ROOT_DIR, "public/assets/globe/models/audit/hybrid");
const TEMP_DIR = path.join(ROOT_DIR, ".codex-temp/globe-model-audit");
const MANUAL_OVERRIDE_PATH = path.join(SCRIPT_DIR, "manual-border-overrides.json");
const VERSION = 1;
const PRODUCTION_APPROVED_IDS = new Set(["AUS", "MDG", "USA", "BRA"]);
const VISUALLY_REVIEWED_IDS = new Set(["IND", "VEN", "BLZ", "GTM", "HND", "SLV", "NIC", "CRI", "PAN", "IRL", "SWE", "GBR", "NOR", "NLD", "BEL", "LUX", "PAK", "AFG", "AZE", "ARM", "TUR", "BGR", "ESP", "PRT", "FRA"]);
const STATUS_DEFINITIONS = {
  generated: "Asset emitted but semantic review found suspicious geometry.",
  "structurally-valid": "Closed, deduplicated, non-self-intersecting asset that has not been visually reviewed.",
  "visually-reviewed": "Inspected against land.glb in the development lab but not approved for production.",
  "production-approved": "Visually reviewed and approved for production use."
};
const SIMPLIFICATION_TOLERANCE = 0.0075;
const COASTAL_PROXIMITY_DEGREES = 3.5;
const RADIUS = 2.71;
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const printCountryId = rawArgs.find((arg) => arg.startsWith("--print-country="))?.split("=")[1]?.trim().toUpperCase() ?? null;
const comparison8k = args.has("--8k");
const checkOnly = args.has("--check") || Boolean(printCountryId);
const width = comparison8k ? 8192 : 4096;
const height = width / 2;

const OPTIONAL_TARGET_IDS = new Set([
  "MAR", "DZA", "TUN", "LBY", "EGY", "ESH", "MRT", "SEN", "GNB", "GIN", "SLE", "LBR", "CIV", "GHA", "TGO", "BEN", "NGA", "CMR", "GNQ", "GAB", "COG", "COD", "AGO", "NAM", "MOZ", "TZA", "KEN", "SOM", "DJI", "ERI", "SDN",
  "VEN", "GUY", "SUR", "COL", "ECU", "PER", "CHL", "ARG", "URY",
  "BLZ", "GTM", "HND", "SLV", "NIC", "CRI", "PAN", "CUB", "DOM", "HTI", "PRI", "RUS", "CHN", "BGD", "MMR", "THA", "KHM", "LAO", "MYS", "VNM", "MNG", "PRK", "KOR", "PHL", "GRL", "ISL",
  "KAZ", "TKM", "IRN", "PAK", "AFG", "AZE", "ARM", "UKR", "GEO", "TUR", "BGR", "ROU",
  "ESP", "PRT", "FRA", "MCO", "ITA", "SVN", "HRV", "BIH", "MNE", "ALB", "GRC", "CYP", "SYR", "LBN", "ISR", "PSE", "MLT",
  "SAU", "JOR", "IRQ", "KWT", "BHR", "QAT", "ARE", "OMN", "YEM",
  "IRL", "DNK", "DEU", "POL", "LTU", "LVA", "EST", "FIN", "SWE", "GBR", "NOR", "NLD", "BEL", "LUX"
]);

const TARGETS = [
  { iso3: "AUS", iso2: "AU", name: "Australia", kind: "regions", regions: [
    { id: "mainland", kind: "island", bounds: [112, -40, 155, -9], sourceRingIndex: 0 },
    { id: "tasmania", kind: "island", bounds: [143, -45, 150, -39], sourceRingIndex: 1 }
  ] },
  { iso3: "MDG", iso2: "MG", name: "Madagascar", kind: "regions", regions: [
    { id: "mainland", kind: "island", bounds: [42, -27, 52, -10] }
  ] },
  { iso3: "USA", iso2: "US", name: "United States lower 48", kind: "regions", regions: [
    { id: "lower48", kind: "hybrid", bounds: [-126, 23, -65, 51], preserveLegacyClassification: true }
  ] },
  { iso3: "BRA", iso2: "BR", name: "Brazil", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-75, -35, -32, 7], preserveLegacyClassification: true }
  ] },
  { iso3: "CAN", iso2: "CA", name: "Canada", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-142, 41, -52, 71], sourceRingIndex: 0 },
    { id: "victoria-island-west", kind: "island", bounds: [-127, 69, -114, 75], sourceRingIndex: 3 },
    { id: "victoria-island-east", kind: "island", bounds: [-120, 67, -101, 73], sourceRingIndex: 2 },
    { id: "ellesmere-island", kind: "island", bounds: [-91, 76, -60, 84], sourceRingIndex: 4 },
    { id: "devon-island", kind: "island", bounds: [-97, 77, -84, 82], sourceRingIndex: 5 },
    { id: "baffin-island", kind: "island", bounds: [-87, 61, -60, 74], sourceRingIndex: 9 },
    { id: "newfoundland", kind: "island", bounds: [-60, 46, -52, 52], sourceRingIndex: 8 }
  ] },
  { iso3: "MEX", iso2: "MX", name: "Mexico", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-119, 13, -85, 34] }
  ] },
  { iso3: "JPN", iso2: "JP", name: "Japan", kind: "regions", regions: [
    { id: "hokkaido", kind: "island", bounds: [140, 41, 148, 46], sourceRingIndex: 0 },
    { id: "honshu", kind: "island", bounds: [137, 34, 145, 42], sourceRingIndex: 1 },
    { id: "shikoku", kind: "island", bounds: [132, 33, 138, 36], sourcePhysicalPathId: "coast-042-c62f7827" },
    { id: "kyushu", kind: "island", bounds: [130, 29, 135, 34], sourcePhysicalPathId: "coast-034-d465ecb2" }
  ] },
  { iso3: "IND", iso2: "IN", name: "India", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [67, 7, 99, 37] }
  ] },
  { iso3: "IDN", iso2: "ID", name: "Indonesia", kind: "regions", regions: [
    { id: "sumatra", kind: "island", bounds: [94, -7, 107, 7], sourceRingIndex: 0 },
    { id: "sulawesi", kind: "island", bounds: [118, -6, 126, 3], sourceRingIndex: 1 },
    { id: "java", kind: "island", bounds: [105, -10, 116, -5], sourceRingIndex: 2 },
    { id: "kalimantan", kind: "hybrid", bounds: [108, -5, 120, 6], sourceRingIndex: 3 },
    { id: "papua", kind: "hybrid", bounds: [130, -11, 142, 1], sourceRingIndex: 4 }
  ] },
  { iso3: "PNG", iso2: "PG", name: "Papua New Guinea", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [140, -11, 151, -2] }
  ] },
  { iso3: "NZL", iso2: "NZ", name: "New Zealand", kind: "regions", regions: [
    { id: "south-island", kind: "island", bounds: [165, -48, 176, -40], sourceRingIndex: 0 },
    { id: "north-island", kind: "island", bounds: [172, -42, 179, -34], sourceRingIndex: 1 }
  ] },
  { iso3: "ZAF", iso2: "ZA", name: "South Africa", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [15, -36, 34, -21] }
  ] },
  { iso3: "MAR", iso2: "MA", name: "Morocco", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-18, 20, 0, 37] }
  ] },
  { iso3: "DZA", iso2: "DZ", name: "Algeria", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-10, 18, 13, 38] }
  ] },
  { iso3: "TUN", iso2: "TN", name: "Tunisia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [6, 29, 13, 38] }
  ] },
  { iso3: "LBY", iso2: "LY", name: "Libya", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [8, 18, 27, 35] }
  ] },
  { iso3: "EGY", iso2: "EG", name: "Egypt", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [23, 20, 38, 33] }
  ] },
  { iso3: "ESH", iso2: "EH", name: "W. Sahara", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-18, 19, -7, 29] }
  ] },
  { iso3: "MRT", iso2: "MR", name: "Mauritania", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-18, 13, -3, 29] }
  ] },
  { iso3: "SEN", iso2: "SN", name: "Senegal", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-19, 11, -10, 18] }
  ] },
  { iso3: "GNB", iso2: "GW", name: "Guinea-Bissau", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-18, 9, -12, 14] }
  ] },
  { iso3: "GIN", iso2: "GN", name: "Guinea", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-17, 6, -6, 14] }
  ] },
  { iso3: "SLE", iso2: "SL", name: "Sierra Leone", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-15, 5, -9, 11] }
  ] },
  { iso3: "LBR", iso2: "LR", name: "Liberia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-13, 3, -6, 10] }
  ] },
  { iso3: "CIV", iso2: "CI", name: "Côte d'Ivoire", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-10, 3, -1, 12] }
  ] },
  { iso3: "GHA", iso2: "GH", name: "Ghana", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-5, 3, 3, 13] }
  ] },
  { iso3: "TGO", iso2: "TG", name: "Togo", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-2, 5, 3, 13] }
  ] },
  { iso3: "BEN", iso2: "BJ", name: "Benin", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [0, 5, 5, 13] }
  ] },
  { iso3: "NGA", iso2: "NG", name: "Nigeria", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [1, 3, 16, 15] }
  ] },
  { iso3: "CMR", iso2: "CM", name: "Cameroon", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [7, 1, 18, 15] }
  ] },
  { iso3: "GNQ", iso2: "GQ", name: "Eq. Guinea", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [8, 0, 13, 4] }
  ] },
  { iso3: "GAB", iso2: "GA", name: "Gabon", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [7, -5, 16, 4] }
  ] },
  { iso3: "COG", iso2: "CG", name: "Congo", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [10, -7, 20, 5] }
  ] },
  { iso3: "COD", iso2: "CD", name: "Dem. Rep. Congo", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [11, -14, 33, 7] }
  ] },
  { iso3: "AGO", iso2: "AO", name: "Angola", kind: "regions", regions: [
    { id: "cabinda", kind: "hybrid", bounds: [11, -7, 14, -3], sourceRingIndex: 0 },
    { id: "mainland", kind: "hybrid", bounds: [10, -20, 25, -5], sourceRingIndex: 1 }
  ] },
  { iso3: "NAM", iso2: "NA", name: "Namibia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [10, -30, 27, -16] }
  ] },
  { iso3: "MOZ", iso2: "MZ", name: "Mozambique", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [29, -28, 42, -9] }
  ] },
  { iso3: "TZA", iso2: "TZ", name: "Tanzania", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [28, -13, 42, 1] }
  ] },
  { iso3: "KEN", iso2: "KE", name: "Kenya", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [32, -6, 43, 7] }
  ] },
  { iso3: "SOM", iso2: "SO", name: "Somalia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [39, -3, 53, 13] }
  ] },
  { iso3: "DJI", iso2: "DJ", name: "Djibouti", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [41, 10, 45, 14] }
  ] },
  { iso3: "ERI", iso2: "ER", name: "Eritrea", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [35, 11, 45, 20], maxCoastlineMatchDegrees: 6 }
  ] },
  { iso3: "SDN", iso2: "SD", name: "Sudan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [20, 7, 40, 24], coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6 }
  ] },
  { iso3: "VEN", iso2: "VE", name: "Venezuela", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-74, 0, -59, 13] }
  ] },
  { iso3: "GUY", iso2: "GY", name: "Guyana", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-62, 0, -55, 10] }
  ] },
  { iso3: "SUR", iso2: "SR", name: "Suriname", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-59, 1, -53, 7] }
  ] },
  { iso3: "COL", iso2: "CO", name: "Colombia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-80, -5, -66, 13], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 7, coastlineRunOverrides: [
      { coastlineCandidateBounds: [-80, 7, -69, 14] },
      { coastlineCandidateBounds: [-81, 0, -75, 9] }
    ] }
  ] },
  { iso3: "ECU", iso2: "EC", name: "Ecuador", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-82, -6, -74, 3], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "PER", iso2: "PE", name: "Peru", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-83, -20, -67, 1], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "CHL", iso2: "CL", name: "Chile", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-77, -54, -66, -16], sourceRingIndex: 0 }
  ] },
  { iso3: "ARG", iso2: "AR", name: "Argentina", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-75, -54, -52, -20] }
  ] },
  { iso3: "URY", iso2: "UY", name: "Uruguay", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-60, -36, -52, -29] }
  ] },
  { iso3: "BLZ", iso2: "BZ", name: "Belize", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-90, 15, -87, 19], coastalProximityDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "GTM", iso2: "GT", name: "Guatemala", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-93, 13, -88, 19], coastalProximityDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "HND", iso2: "HN", name: "Honduras", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-90, 12, -82, 17], coastalProximityDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "SLV", iso2: "SV", name: "El Salvador", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-91, 12, -87, 15], coastalProximityDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "NIC", iso2: "NI", name: "Nicaragua", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-88, 10, -82, 16], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 7, requirePoliticalSegments: true, coastlineRunOverrides: [
      { coastlineCandidateBounds: [-89, 9, -84, 14] },
      { coastlineCandidateBounds: [-85, 10, -81, 16] }
    ] }
  ] },
  { iso3: "CRI", iso2: "CR", name: "Costa Rica", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-86, 7, -82, 12], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 7, requirePoliticalSegments: true, coastlineRunOverrides: [
      { coastlineCandidateBounds: [-85, 9, -81, 12] },
      { coastlineCandidateBounds: [-87, 6, -82, 12] }
    ] }
  ] },
  { iso3: "PAN", iso2: "PA", name: "Panama", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-83, 7, -77, 10], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 7, requirePoliticalSegments: true, coastlineRunOverrides: [
      { coastlineCandidateBounds: [-84, 8, -76, 11] },
      { coastlineCandidateBounds: [-84, 6, -76, 10] }
    ] }
  ] },
  { iso3: "CUB", iso2: "CU", name: "Cuba", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [-85, 18, -73, 25], sourceRingIndex: 0 }
  ] },
  { iso3: "PRI", iso2: "PR", name: "Puerto Rico", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [-68, 17, -65, 19], sourceRingIndex: 0, requireLocalPath: false }
  ] },
  { iso3: "DOM", iso2: "DO", name: "Dominican Republic", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-73, 17, -67, 21], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "HTI", iso2: "HT", name: "Haiti", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-75, 17, -71, 21], sourceRingIndex: 0 }
  ] },
  { iso3: "RUS", iso2: "RU", name: "Russia", kind: "regions", regions: [
    { id: "chukotka-dateline", kind: "hybrid", bounds: [-180, 63, -168, 70], sourceRingIndex: 0, coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6, forceDatelineEdgesPolitical: true, presentation: false },
    { id: "mainland", kind: "hybrid", bounds: [20, 40, 180, 79], sourceRingIndex: 1, coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6 },
    { id: "sakhalin", kind: "island", bounds: [140, 47, 146, 56], sourceRingIndex: 2, optional: true, requireLocalPath: true },
    { id: "kaliningrad", kind: "hybrid", bounds: [18, 53, 24, 57], sourceRingIndex: 3, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "CHN", iso2: "CN", name: "China", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [72, 20, 136, 55], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "BGD", iso2: "BD", name: "Bangladesh", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [87, 19, 94, 28], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true, forcePoliticalEdgeIndices: [3, 4, 5, 6, 7] }
  ] },
  { iso3: "MMR", iso2: "MM", name: "Myanmar", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [91, 9, 103, 30], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true, forcePoliticalEdgeIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 16, 17, 18, 19, 20, 21, 22], useSourceCoastline: true }
  ] },
  { iso3: "THA", iso2: "TH", name: "Thailand", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [96, 5, 107, 22], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true, minimumRingPointCount: 10, coastlineRunOverrides: [
      { sourcePhysicalPathId: "coast-003-0886b6c3", coastlineCandidateBounds: [97, 5, 101, 11] },
      { sourcePhysicalPathId: "coast-003-0886b6c3", coastlineCandidateBounds: [99, 5, 104, 14] }
    ] }
  ] },
  { iso3: "KHM", iso2: "KH", name: "Cambodia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [102, 10, 108, 15], coastalProximityDegrees: 5, requirePoliticalSegments: true, useSourceCoastline: true }
  ] },
  { iso3: "LAO", iso2: "LA", name: "Laos", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [100, 13, 108, 23], politicalOnly: true }
  ] },
  { iso3: "MYS", iso2: "MY", name: "Malaysia", kind: "regions", regions: [
    { id: "peninsular", kind: "hybrid", bounds: [99, 1, 105, 8], sourceRingIndex: 0, coastalProximityDegrees: 5, requirePoliticalSegments: true, minimumRingPointCount: 6, useSourceCoastline: true },
    { id: "borneo", kind: "hybrid", bounds: [108, 0, 121, 8], sourceRingIndex: 1, coastalProximityDegrees: 5, requirePoliticalSegments: true, minimumRingPointCount: 10, useSourceCoastline: true }
  ] },
  { iso3: "VNM", iso2: "VN", name: "Vietnam", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [101, 8, 111, 24], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, maxSourceCoastlineDeviationDegrees: 3.25, requirePoliticalSegments: true, minimumRingPointCount: 8 }
  ] },
  { iso3: "PRK", iso2: "KP", name: "North Korea", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [123, 36, 132, 44], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "KOR", iso2: "KR", name: "South Korea", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [125, 33, 131, 40], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "PHL", iso2: "PH", name: "Philippines", kind: "regions", regions: [
    { id: "luzon-group", kind: "island", bounds: [118, 13, 124, 20], sourceRingIndex: 0 },
    { id: "mindanao-group", kind: "island", bounds: [123, 5, 128, 11], sourceRingIndex: 1 }
  ] },
  { iso3: "GRL", iso2: "GL", name: "Greenland", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [-74, 58, -17, 85], sourceRingIndex: 0 }
  ] },
  { iso3: "ISL", iso2: "IS", name: "Iceland", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [-26, 62, -13, 68], sourceRingIndex: 0 }
  ] },
  { iso3: "IRL", iso2: "IE", name: "Ireland", kind: "regions", regions: [
    { id: "republic", kind: "hybrid", bounds: [-12, 51, -5, 56], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, forcePoliticalEdgeIndices: [4], requirePoliticalSegments: true, coastlineRunOverrides: [
      { sourcePhysicalPathId: "coast-025-a10cc63b", coastlineCandidateBounds: [-14, 51, -5, 58] }
    ] }
  ] },
  { iso3: "DNK", iso2: "DK", name: "Denmark", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [7, 54, 16, 58], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, minimumRingPointCount: 6 }
  ] },
  { iso3: "DEU", iso2: "DE", name: "Germany", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [5, 47, 16, 56], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "POL", iso2: "PL", name: "Poland", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [13, 48, 25, 56], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "LTU", iso2: "LT", name: "Lithuania", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [20, 53, 28, 58], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "LVA", iso2: "LV", name: "Latvia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [20, 54, 30, 59], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "EST", iso2: "EE", name: "Estonia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [22, 56, 30, 61], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "FIN", iso2: "FI", name: "Finland", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [19, 58, 33, 71], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 6, requirePoliticalSegments: true, minimumRingPointCount: 12, coastlineRunOverrides: [
      { sourcePhysicalPathId: "coast-012-a0233821", coastlineCandidateBounds: [10, 55, 33, 68] }
    ] }
  ] },
  { iso3: "SWE", iso2: "SE", name: "Sweden", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [10, 54, 26, 71], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 6, requirePoliticalSegments: true, minimumRingPointCount: 13, coastlineRunOverrides: [
      { sourcePhysicalPathId: "coast-012-a0233821", coastlineCandidateBounds: [10, 55, 27, 67] }
    ] }
  ] },
  { iso3: "GBR", iso2: "GB", name: "United Kingdom", kind: "regions", regions: [
    { id: "great-britain", kind: "hybrid", bounds: [-7, 49, 3, 60], sourceRingIndex: 0, coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 6, maxSourceCoastlineDeviationDegrees: 6, sourcePhysicalPathIds: ["coast-003-0886b6c3"], coastlineCandidateBounds: [-10, 47, 6, 63], minimumRingPointCount: 10 },
    { id: "northern-ireland", kind: "hybrid", bounds: [-9, 53, -5, 56], sourceRingIndex: 1, coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, forcePoliticalEdgeIndices: [3, 4], requirePoliticalSegments: true, coastlineRunOverrides: [
      { sourcePhysicalPathId: "coast-025-a10cc63b", coastlineCandidateBounds: [-14, 51, -5, 58] }
    ] }
  ] },
  { iso3: "NOR", iso2: "NO", name: "Norway", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [3, 56, 33, 73], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 6, requirePoliticalSegments: true }
  ] },
  { iso3: "NLD", iso2: "NL", name: "Netherlands", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [3, 49, 9, 55], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true, coastlineCandidateBounds: [2, 50, 8, 55], minimumRingPointCount: 4 }
  ] },
  { iso3: "BEL", iso2: "BE", name: "Belgium", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [1, 48, 8, 53], coastalProximityDegrees: 4, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true, minimumRingPointCount: 6 }
  ] },
  { iso3: "LUX", iso2: "LU", name: "Luxembourg", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [5, 49, 7, 51], politicalOnly: true }
  ] },
  { iso3: "KAZ", iso2: "KZ", name: "Kazakhstan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [45, 40, 89, 57], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "MNG", iso2: "MN", name: "Mongolia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [86, 40, 120, 53], politicalOnly: true }
  ] },
  { iso3: "TKM", iso2: "TM", name: "Turkmenistan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [51, 34, 68, 44], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "IRN", iso2: "IR", name: "Iran", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [43, 24, 65, 41], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 8 }
  ] },
  { iso3: "PAK", iso2: "PK", name: "Pakistan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [60, 22, 78, 38], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "AFG", iso2: "AF", name: "Afghanistan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [59, 28, 75, 39], politicalOnly: true }
  ] },
  { iso3: "AZE", iso2: "AZ", name: "Azerbaijan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [44, 37, 51, 43], sourceRingIndex: 1, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "ARM", iso2: "AM", name: "Armenia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [43, 38, 47, 42], politicalOnly: true }
  ] },
  { iso3: "UKR", iso2: "UA", name: "Ukraine", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [21, 44, 41, 54], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "GEO", iso2: "GE", name: "Georgia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [38, 40, 48, 45], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "TUR", iso2: "TR", name: "Türkiye", kind: "regions", regions: [
    { id: "anatolia", kind: "hybrid", bounds: [25, 35, 46, 43], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, forcePoliticalEdgeIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], requirePoliticalSegments: true, coastlineCandidateBounds: [32, 34, 38, 39], minimumRingPointCount: 10 },
    { id: "thrace", kind: "hybrid", bounds: [25, 40, 29, 43], sourceRingIndex: 1, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "BGR", iso2: "BG", name: "Bulgaria", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [21, 40, 30, 46], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "ROU", iso2: "RO", name: "Romania", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [19, 42, 31, 50], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "ESP", iso2: "ES", name: "Spain", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-10, 35, 5, 45], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 6, coastlineRunOverrides: [
      { coastlineCandidateBounds: [-11, 40, 0, 45] },
      { coastlineCandidateBounds: [-9, 35, 5, 44] }
    ] }
  ] },
  { iso3: "PRT", iso2: "PT", name: "Portugal", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [-10, 36, -6, 43], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5, requirePoliticalSegments: true }
  ] },
  { iso3: "FRA", iso2: "FR", name: "France", kind: "regions", regions: [
    { id: "metropolitan", kind: "hybrid", bounds: [-6, 40, 10, 53], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 7, forcePoliticalEdgeIndices: [15], minimumRingPointCount: 12, coastlineRunOverrides: [
      { coastlineCandidateBounds: [-7, 42, 4, 53] },
      { coastlineCandidateBounds: [2, 41, 9, 46] }
    ] }
  ] },
  { iso3: "MCO", iso2: "MC", name: "Monaco", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [7, 43, 8, 44] }
  ] },
  { iso3: "ITA", iso2: "IT", name: "Italy", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [6, 38, 19, 48], manualHybrid: {
      sourcePhysicalPathId: "coast-003-0886b6c3",
      coastlineStart: [12.3925781, 45.8789063],
      coastlineEnd: [7.8222656, 45.5273438],
      politicalWaypoints: [
        [7.02109375, 45.92578125],
        [10.45283203125, 46.86494140625],
        [13.7, 46.520263671875],
        [13.71982421875, 45.58759765625]
      ]
    } },
    { id: "sicily", kind: "island", bounds: [11, 37, 16, 41], sourcePhysicalPathId: "coast-046-d2552d3d", compactAudit: true }
  ] },
  { iso3: "SVN", iso2: "SI", name: "Slovenia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [12, 44, 18, 48], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "HRV", iso2: "HR", name: "Croatia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [12, 41, 20, 48], sourceRingIndex: 0, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 },
    { id: "dubrovnik", kind: "hybrid", bounds: [17, 41, 20, 44], sourceRingIndex: 1, coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "BIH", iso2: "BA", name: "Bosnia and Herzegovina", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [14, 41, 21, 46], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "MNE", iso2: "ME", name: "Montenegro", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [17, 40, 22, 45], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "ALB", iso2: "AL", name: "Albania", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [18, 38, 22, 44], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "GRC", iso2: "GR", name: "Greece", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [18, 35, 28, 43], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 3, coastlineCandidateBounds: [18, 35, 28, 42] }
  ] },
  { iso3: "CYP", iso2: "CY", name: "Cyprus", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [31, 34, 35, 36], requireLocalPath: true }
  ] },
  { iso3: "SYR", iso2: "SY", name: "Syria", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [34, 31, 44, 39], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "LBN", iso2: "LB", name: "Lebanon", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [34, 32, 37, 36], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "ISR", iso2: "IL", name: "Israel", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [33, 28, 37, 35], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "PSE", iso2: "PS", name: "Palestine", kind: "regions", regions: [
    { id: "gaza", kind: "hybrid", bounds: [33, 30, 36, 33], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "MLT", iso2: "MT", name: "Malta", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [14, 35, 15, 36] }
  ] },
  { iso3: "SAU", iso2: "SA", name: "Saudi Arabia", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [33, 15, 57, 34], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "JOR", iso2: "JO", name: "Jordan", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [33, 28, 41, 35], coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6 }
  ] },
  { iso3: "IRQ", iso2: "IQ", name: "Iraq", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [37, 28, 50, 39], coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6 }
  ] },
  { iso3: "KWT", iso2: "KW", name: "Kuwait", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [45, 27, 50, 31], coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6 }
  ] },
  { iso3: "BHR", iso2: "BH", name: "Bahrain", kind: "regions", regions: [
    { id: "main-island", kind: "island", bounds: [50, 25, 51, 27] }
  ] },
  { iso3: "QAT", iso2: "QA", name: "Qatar", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [50, 24, 52, 27] }
  ] },
  { iso3: "ARE", iso2: "AE", name: "United Arab Emirates", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [50, 21, 58, 27], coastalProximityDegrees: 6, maxCoastlineMatchDegrees: 6 }
  ] },
  { iso3: "OMN", iso2: "OM", name: "Oman", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [50, 15, 61, 27], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] },
  { iso3: "YEM", iso2: "YE", name: "Yemen", kind: "regions", regions: [
    { id: "mainland", kind: "hybrid", bounds: [41, 11, 55, 21], coastalProximityDegrees: 5, maxCoastlineMatchDegrees: 5 }
  ] }
];

const started = performance.now();
const memoryBefore = process.memoryUsage().rss;
const geometry = collectGeometry(readGlb(LAND_PATH));
const faceScores = calculateFaceOrientationScores(geometry);
const maskStarted = performance.now();
const mask = buildRadialLandMask({ width, height, geometry, faceScores });
const maskDurationMs = performance.now() - maskStarted;
const tracedPaths = traceMaskBoundary(mask).map(normalizeTracedPath).filter((path) => path.coordinates.length >= 4);
const physicalPaths = tracedPaths
  .map((path) => preparePhysicalPath(path))
  .sort(comparePhysicalPaths)
  .map((path, index) => ({ ...path, id: `coast-${String(index + 1).padStart(3, "0")}-${path.fingerprint.slice(0, 8)}` }));

const countries = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
const fullCountries = JSON.parse(fs.readFileSync(FULL_GEOJSON_PATH, "utf8"));
const featureIso3 = (feature) => feature.properties?.ISO_A3 ?? feature.properties?.ADM0_A3 ?? null;
const fullFeaturesByIso3 = new Map((fullCountries.features ?? []).map((feature) => [featureIso3(feature), feature]));
const preferFullGeometryIds = new Set(["GBR"]);
const features = (countries.features ?? []).map((feature) => {
  const iso3 = featureIso3(feature);
  const fallback = fullFeaturesByIso3.get(iso3);
  if (preferFullGeometryIds.has(iso3) && fallback?.geometry) return fallback;
  if (feature.geometry) return feature;
  return fallback?.geometry ? fallback : feature;
});
const edgeCounts = buildGeoJsonEdgeCounts(features);
const idAtlas = readRgbPng(ID_ATLAS_PATH);
const lookup = Object.values(JSON.parse(fs.readFileSync(LOOKUP_PATH, "utf8")));
const outputFiles = new Map();
const manualOverrides = fs.existsSync(MANUAL_OVERRIDE_PATH)
  ? JSON.parse(fs.readFileSync(MANUAL_OVERRIDE_PATH, "utf8"))
  : { version: VERSION, countries: {} };
const configuredTargetIds = new Set(TARGETS.map((target) => target.iso3));
const overrideOnlyTargets = Object.entries(manualOverrides.countries ?? {}).flatMap(([iso3, countryOverride]) => {
  if (configuredTargetIds.has(iso3)) return [];
  const feature = findFeature(features, iso3);
  if (!feature?.geometry) return [];
  const sourceRings = geometryRings(feature.geometry);
  const ringIds = Object.keys(countryOverride?.rings ?? {});
  if (!ringIds.length) return [];
  return [{
    iso3,
    iso2: feature.properties?.ISO_A2 ?? "",
    name: feature.properties?.NAME_EN ?? feature.properties?.NAME ?? feature.properties?.ADMIN ?? iso3,
    kind: "regions",
    manualOverrideOnly: true,
    regions: ringIds.map((id, index) => ({
      id,
      kind: "hybrid",
      bounds: [-180, -90, 180, 90],
      sourceRingIndex: Math.min(index, Math.max(0, sourceRings.length - 1))
    }))
  }];
});
const targetsToBuild = comparison8k
  ? TARGETS.filter((item) => item.regions.every((region) => region.kind === "island"))
  : [...TARGETS, ...overrideOnlyTargets];

const compactPhysical = {
  version: VERSION,
  source: {
    landModel: "/assets/globe/models/land.glb",
    resolution: [width, height],
    projection: "equirectangular-radial",
    simplificationToleranceModelUnits: SIMPLIFICATION_TOLERANCE
  },
  paths: physicalPaths.map(stripDensePhysicalPath)
};
const densePhysical = {
  ...compactPhysical,
  paths: physicalPaths.map((item) => ({ ...stripDensePhysicalPath(item), denseCoordinates: item.denseCoordinates }))
};
if (!comparison8k) outputFiles.set(path.join(COASTLINE_DIR, `physical-coastlines-v${VERSION}.json`), stableJson(compactPhysical));
outputFiles.set(path.join(AUDIT_DIR, `physical-coastlines-v${VERSION}${comparison8k ? "-8k" : ""}-dense.json`), stableJson(densePhysical));

const manifest = { version: VERSION, coastlineAssetVersion: VERSION, statusDefinitions: STATUS_DEFINITIONS, countries: {}, skippedCountries: {} };
const summaries = [];
const skippedCountries = [];
const builtAssets = [];
for (const target of targetsToBuild) {
  const feature = findFeature(features, target.iso3);
  const optionalTarget = OPTIONAL_TARGET_IDS.has(target.iso3) || target.manualOverrideOnly === true;
  if (!feature) {
    if (optionalTarget) {
      const skipped = { countryId: target.iso3, status: "generated", reason: "Missing GeoJSON feature." };
      skippedCountries.push(skipped);
      manifest.skippedCountries[target.iso3] = skipped;
      continue;
    }
    throw new Error(`Missing GeoJSON feature ${target.iso3}.`);
  }
  let built;
  try {
    const ownership = createOwnershipSampler({ target, idAtlas, lookup });
    built = buildRegionalCountry({
      target,
      feature,
      physicalPaths,
      ownership,
      edgeCounts,
      countryOverride: manualOverrides.countries?.[target.iso3] ?? null
    });
    validateCountryAsset(built.asset);
  } catch (error) {
    if (!optionalTarget) throw error;
    const skipped = { countryId: target.iso3, status: "generated", reason: error.message };
    skippedCountries.push(skipped);
    manifest.skippedCountries[target.iso3] = skipped;
    continue;
  }
  const assetName = `${target.iso3.toLowerCase()}.json`;
  const auditName = `${target.iso3.toLowerCase()}-diagnostic.json`;
  if (comparison8k) {
    outputFiles.set(path.join(AUDIT_DIR, `${target.iso3.toLowerCase()}-8k-comparison.json`), stableJson({ asset: built.asset, audit: built.audit }));
  } else {
    outputFiles.set(path.join(HYBRID_DIR, assetName), stableJson(built.asset));
    outputFiles.set(path.join(AUDIT_DIR, auditName), stableJson(built.audit));
  }
  manifest.countries[target.iso3] = {
    aliases: [target.iso2, target.iso3, target.name.toUpperCase()],
    url: `/assets/globe/borders/hybrid/v1/${assetName}`,
    diagnosticUrl: `/assets/globe/models/audit/hybrid/${auditName}`,
    status: built.asset.status,
    ringCount: built.asset.rings.length,
    semanticIssueCount: built.asset.semanticValidation.issues.length,
    physicalPathIds: [...new Set(built.asset.rings.flatMap((ring) => ring.segments.map((segment) => segment.sourcePathId).filter(Boolean)))]
  };
  builtAssets.push(built.asset);
  summaries.push(built.summary);
}
if (!comparison8k) outputFiles.set(path.join(HYBRID_DIR, "manifest.json"), stableJson(manifest));

if (printCountryId) {
  const assetPath = path.join(HYBRID_DIR, `${printCountryId.toLowerCase()}.json`);
  const diagnosticPath = path.join(AUDIT_DIR, `${printCountryId.toLowerCase()}-diagnostic.json`);
  console.log(JSON.stringify({
    countryId: printCountryId,
    manifestEntry: manifest.countries[printCountryId] ?? manifest.skippedCountries[printCountryId] ?? null,
    asset: outputFiles.has(assetPath) ? JSON.parse(outputFiles.get(assetPath)) : null,
    diagnostic: outputFiles.has(diagnosticPath) ? JSON.parse(outputFiles.get(diagnosticPath)) : null
  }));
  process.exit(0);
}

let different = false;
for (const [filePath, content] of outputFiles) {
  const prior = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (prior !== content) different = true;
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}
if (checkOnly && different) throw new Error("Generated coastline or hybrid-border assets are not current.");

const report = {
  version: VERSION,
  resolution: [width, height],
  extractionDurationMs: round(maskDurationMs, 3),
  totalDurationMs: round(performance.now() - started, 3),
  peakObservedRssBytes: process.memoryUsage().rss,
  rssIncreaseBytes: process.memoryUsage().rss - memoryBefore,
  landPixelCount: mask.landPixelCount,
  physicalPathCount: physicalPaths.length,
  densePointCount: physicalPaths.reduce((sum, item) => sum + item.denseCoordinates.length, 0),
  simplifiedPointCount: physicalPaths.reduce((sum, item) => sum + item.simplifiedCoordinates.length, 0),
  outputs: [...outputFiles.keys()].map((filePath) => ({
    path: relativePath(filePath),
    bytes: Buffer.byteLength(outputFiles.get(filePath)),
    sha256: sha256(outputFiles.get(filePath))
  })),
  countries: summaries,
  skippedCountries,
  duplicatePhysicalCoastlineAssignments: findDuplicatePhysicalCoastlineAssignments(builtAssets, physicalPaths),
  unexpectedCountryContainments: findUnexpectedCountryContainments(builtAssets, features),
  suspiciousDisconnectedFragments: findSuspiciousDisconnectedFragments(builtAssets)
};
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.writeFileSync(path.join(TEMP_DIR, `land-coastline-build-report${comparison8k ? "-8k" : ""}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function buildRegionalCountry({ target, feature, physicalPaths, ownership, edgeCounts, countryOverride = null }) {
  const sourceRings = geometryRings(feature.geometry);
  const rings = [];
  const auditRings = [];
  const usedSourceRings = new Set();

  for (const region of target.regions) {
    const forcedPhysicalPath = region.sourcePhysicalPathId
      ? physicalPaths.find((path) => path.id === region.sourcePhysicalPathId) ?? null
      : null;
    const sourceRing = forcedPhysicalPath?.simplifiedCoordinates
      ?? chooseUnusedRegionalRing(sourceRings, region.bounds, usedSourceRings, region.sourceRingIndex);
    if (!sourceRing) throw new Error(`${target.iso3}/${region.id}: source ring not found.`);
    if (!forcedPhysicalPath) usedSourceRings.add(sourceRing);

    const ringOverride = countryOverride?.rings?.[region.id] ?? null;
    if (ringOverride) {
      const built = buildManualOverrideRegion({ target, region, sourceRing, override: ringOverride });
      if (region.presentation === false) built.ring.presentation = false;
      rings.push(built.ring);
      auditRings.push(built.audit);
      continue;
    }

    if (region.manualHybrid) {
      const built = buildManualHybridRegion({ target, region, sourceRing, physicalPaths });
      if (region.presentation === false) built.ring.presentation = false;
      rings.push(built.ring);
      auditRings.push(built.audit);
      continue;
    }

    if (region.kind === "island") {
      let path;
      try {
        path = chooseIslandPath({ sourceRing, region, physicalPaths, ownership });
      } catch (error) {
        if (region.optional) {
          auditRings.push({ id: region.id, sourceGeoJson: sourceRing, skipped: true, reason: error.message });
          continue;
        }
        throw error;
      }
      const coordinates = orientClosedPath(path.simplifiedCoordinates, sourceRing);
      const dense = orientClosedPath(path.denseCoordinates, sourceRing);
      const ring = buildRingAsset({
        id: region.id,
        segments: [{ kind: "coastline", sourcePathId: path.id, startIndex: 0, endIndex: path.denseCoordinates.length - 1, direction: pathDirection(path.simplifiedCoordinates, coordinates), coordinates }],
        flattened: coordinates,
        sourceRing,
        denseCoastline: dense
      });
      if (region.presentation === false) ring.presentation = false;
      rings.push(ring);
      auditRings.push({ id: region.id, sourceGeoJson: sourceRing, rejectedGeoJsonCoastline: [sourceRing], denseCoastline: [region.compactAudit ? coordinates : dense], simplifiedCoastline: [coordinates], politicalSegments: [], junctions: [], assembled: coordinates });
      continue;
    }

    const built = buildHybridRegion({ target, region, sourceRing, physicalPaths, ownership, edgeCounts });
    if (region.presentation === false) built.ring.presentation = false;
    rings.push(built.ring);
    auditRings.push(built.audit);
  }

  return finishCountry({ target, rings, auditRings, sourceFeature: feature });
}

function buildManualOverrideRegion({ target, region, sourceRing, override }) {
  const coordinates = ensureClosed(dedupeCoordinates(
    (override.coordinates ?? []).map((coordinate) => [Number(coordinate?.[0]), Number(coordinate?.[1])])
      .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]))
  ));
  if (coordinates.length < 4) throw new Error(`${target.iso3}/${region.id}: manual override requires at least 3 unique points.`);

  const edgeCount = coordinates.length - 1;
  const edgeKinds = Array.from({ length: edgeCount }, (_, index) =>
    override.edgeKinds?.[index] === "coastline" ? "coastline" : "political"
  );
  const segments = edgeKinds.map((kind, index) => ({
    kind,
    ...(kind === "coastline" ? { sourcePathId: null } : { neighborId: null }),
    coordinates: [copyCoordinate(coordinates[index]), copyCoordinate(coordinates[index + 1])]
  }));
  const coastlineSegments = segments.filter((segment) => segment.kind === "coastline").map((segment) => segment.coordinates);
  const politicalSegments = segments.filter((segment) => segment.kind === "political").map((segment) => segment.coordinates);
  const audit = {
    id: region.id,
    sourceGeoJson: sourceRing,
    manualOverride: true,
    rejectedGeoJsonCoastline: [],
    denseCoastline: coastlineSegments,
    simplifiedCoastline: coastlineSegments,
    politicalSegments,
    junctions: [],
    assembled: coordinates
  };
  const ring = buildRingAsset({
    id: region.id,
    segments,
    flattened: coordinates,
    sourceRing,
    denseCoastline: coastlineSegments.flat()
  });
  ring.manualOverride = true;
  ring.manualEdgeKinds = edgeKinds;
  return { ring, audit };
}

function buildManualHybridRegion({ target, region, sourceRing, physicalPaths }) {
  const spec = region.manualHybrid;
  const path = physicalPaths.find((candidate) => candidate.id === spec.sourcePhysicalPathId);
  if (!path) throw new Error(`${target.iso3}/${region.id}: physical coastline path ${spec.sourcePhysicalPathId} not found.`);

  const startIndex = nearestCoordinateIndex(spec.coastlineStart, path.denseCoordinates);
  const endIndex = nearestCoordinateIndex(spec.coastlineEnd, path.denseCoordinates);
  const arcs = pathArcs(path.denseCoordinates, startIndex, endIndex, path.closed);
  const arc = arcs.sort((a, b) => a.coordinates.length - b.coordinates.length)[0];
  if (!arc?.coordinates?.length) throw new Error(`${target.iso3}/${region.id}: manual coastline arc is empty.`);

  const coastline = simplifyGeoPath(arc.coordinates, SIMPLIFICATION_TOLERANCE, false);
  const political = [
    copyCoordinate(coastline.at(-1)),
    ...(spec.politicalWaypoints ?? []).map(copyCoordinate),
    copyCoordinate(coastline[0])
  ];
  const segments = [
    {
      kind: "coastline",
      sourcePathId: path.id,
      startIndex: arc.indices[0],
      endIndex: arc.indices.at(-1),
      direction: arc.direction,
      coordinates: coastline
    },
    { kind: "political", coordinates: political, neighborId: null }
  ];
  const audit = {
    id: region.id,
    sourceGeoJson: sourceRing,
    rejectedGeoJsonCoastline: [sourceRing],
    denseCoastline: [coastline],
    simplifiedCoastline: [coastline],
    politicalSegments: [political],
    junctions: [],
    assembled: []
  };
  stitchJunctions(segments, audit.junctions);
  const flattened = flattenSegments(segments);
  audit.assembled = flattened;
  return {
    ring: buildRingAsset({
      id: region.id,
      segments,
      flattened,
      sourceRing,
      denseCoastline: arc.coordinates
    }),
    audit
  };
}

function buildHybridRegion({ target, region, sourceRing, physicalPaths, ownership, edgeCounts }) {
  if (region.politicalOnly) {
    const coordinates = sourceRing.map(copyCoordinate);
    const audit = {
      id: region.id,
      sourceGeoJson: sourceRing,
      rejectedGeoJsonCoastline: [],
      denseCoastline: [],
      simplifiedCoastline: [],
      politicalSegments: [coordinates],
      junctions: [],
      assembled: coordinates
    };
    return {
      ring: buildRingAsset({
        id: region.id,
        segments: [{ kind: "political", coordinates, neighborId: null }],
        flattened: coordinates,
        sourceRing,
        denseCoastline: []
      }),
      audit
    };
  }

  const runs = classifyRingRuns(
    sourceRing,
    edgeCounts,
    physicalPaths,
    ownership,
    region.coastalProximityDegrees ?? COASTAL_PROXIMITY_DEGREES,
    region.coastlineLatitudeMax ?? null,
    region.forceDatelineEdgesPolitical ?? false,
    region.forcePoliticalEdgeIndices ?? [],
    region.preserveLegacyClassification === true
  );
  const segments = [];
  const usedPhysicalEdges = new Set();
  let coastlineRunIndex = 0;
  const audit = { id: region.id, sourceGeoJson: sourceRing, rejectedGeoJsonCoastline: [], denseCoastline: [], simplifiedCoastline: [], politicalSegments: [], junctions: [], assembled: [] };
  for (const run of runs) {
    if (run.kind !== "coastline") {
      const coordinates = run.coordinates.map(copyCoordinate);
      segments.push({ kind: "political", coordinates, neighborId: inferNeighborId(run, features, target.iso3) });
      audit.politicalSegments.push(coordinates);
      continue;
    }
    const runOverride = region.coastlineRunOverrides?.[coastlineRunIndex] ?? {};
    coastlineRunIndex += 1;
    if (region.useSourceCoastline) {
      const coordinates = run.coordinates.map(copyCoordinate);
      segments.push({ kind: "coastline", sourcePathId: null, startIndex: 0, endIndex: coordinates.length - 1, direction: 1, coordinates });
      audit.rejectedGeoJsonCoastline.push(run.coordinates);
      audit.denseCoastline.push(coordinates);
      audit.simplifiedCoastline.push(coordinates);
      continue;
    }
    let match;
    try {
      match = chooseCoastlineArc({
        sourceCoordinates: run.coordinates,
        physicalPaths,
        ownership,
        maxEndpointDistance: runOverride.maxCoastlineMatchDegrees ?? region.maxCoastlineMatchDegrees ?? 3,
        maxSourceDeviation: runOverride.maxSourceCoastlineDeviationDegrees ?? region.maxSourceCoastlineDeviationDegrees ?? null,
        candidateBounds: runOverride.coastlineCandidateBounds ?? region.coastlineCandidateBounds ?? null,
        candidatePathIds: runOverride.sourcePhysicalPathId ? [runOverride.sourcePhysicalPathId] : region.sourcePhysicalPathIds ?? null,
        diverseEndpointCandidates: region.preserveLegacyClassification !== true,
        waypoints: runOverride.coastlineWaypoints ?? region.coastlineWaypoints ?? [],
        waypointTolerance: runOverride.coastlineWaypointToleranceDegrees ?? region.coastlineWaypointToleranceDegrees ?? 1.5,
        excludedEdges: usedPhysicalEdges
      });
    } catch (error) {
      throw new Error(`${target.iso3}/${region.id}: ${error.message}`);
    }
    const simplified = simplifyGeoPath(match.coordinates, SIMPLIFICATION_TOLERANCE, false);
    segments.push({
      kind: "coastline",
      sourcePathId: match.path.id,
      startIndex: match.startIndex,
      endIndex: match.endIndex,
      direction: match.direction,
      coordinates: simplified
    });
    audit.rejectedGeoJsonCoastline.push(run.coordinates);
    audit.denseCoastline.push(match.coordinates);
    audit.simplifiedCoastline.push(simplified);
    for (const edge of physicalIndexEdgeKeys(match.path.id, match.indices)) usedPhysicalEdges.add(edge);
  }
  if (!segments.some((segment) => segment.kind === "coastline")) {
    throw new Error(`${target.iso3}/${region.id}: expected at least one coastline segment.`);
  }
  if (region.requirePoliticalSegments && !segments.some((segment) => segment.kind === "political")) {
    throw new Error(`${target.iso3}/${region.id}: expected at least one political segment.`);
  }
  stitchJunctions(segments, audit.junctions);
  const flattened = flattenSegments(segments);
  audit.assembled = flattened;
  const ring = buildRingAsset({ id: region.id, segments, flattened, sourceRing, denseCoastline: audit.denseCoastline.flat() });
  if (Number.isFinite(region.minimumRingPointCount) && ring.coordinates.length < region.minimumRingPointCount) {
    throw new Error(`${target.iso3}/${region.id}: collapsed to ${ring.coordinates.length} points; expected at least ${region.minimumRingPointCount}.`);
  }
  return { ring, audit };
}

function chooseUnusedRegionalRing(sourceRings, bounds, usedSourceRings, sourceRingIndex = null) {
  if (Number.isInteger(sourceRingIndex)) {
    const indexed = sourceRings[sourceRingIndex] ?? null;
    return indexed && !usedSourceRings.has(indexed) ? indexed : null;
  }
  return sourceRings
    .filter((ring) => !usedSourceRings.has(ring) && ring.some((coordinate) => inBounds(coordinate, bounds)))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

function finishCountry({ target, rings, auditRings, sourceFeature }) {
  const coastlinePointCount = rings.reduce((sum, ring) => sum + ring.segments.filter((segment) => segment.kind === "coastline").reduce((count, segment) => count + segment.coordinates.length, 0), 0);
  const politicalPointCount = rings.reduce((sum, ring) => sum + ring.segments.filter((segment) => segment.kind === "political").reduce((count, segment) => count + segment.coordinates.length, 0), 0);
  const diagnostics = {
    coastlinePointCount,
    politicalPointCount,
    junctionCount: rings.reduce((sum, ring) => sum + ring.validation.junctionCount, 0),
    maxJunctionGapDegrees: Math.max(0, ...rings.map((ring) => ring.validation.maxJunctionGapDegrees)),
    maxPreStitchJunctionGapDegrees: Math.max(0, ...rings.map((ring) => ring.validation.maxPreStitchJunctionGapDegrees)),
    maxCoastlineDeviationModelUnits: Math.max(0, ...rings.map((ring) => ring.validation.maxCoastlineDeviationModelUnits)),
    maxPoliticalDeviationDegrees: Math.max(0, ...rings.map((ring) => ring.validation.maxPoliticalDeviationDegrees)),
    maxPoliticalInteriorDeviationDegrees: 0,
    selfIntersectionCount: rings.reduce((sum, ring) => sum + ring.validation.selfIntersectionCount, 0),
    closedRingCount: rings.filter((ring) => ring.validation.closed).length
  };
  const semanticValidation = buildCountrySemanticValidation({ target, rings });
  const hasSemanticErrors = semanticValidation.issues.some((issue) => issue.severity === "error");
  const status = PRODUCTION_APPROVED_IDS.has(target.iso3) && !hasSemanticErrors
    ? "production-approved"
    : semanticValidation.issues.length
      ? "generated"
      : VISUALLY_REVIEWED_IDS.has(target.iso3)
        ? "visually-reviewed"
      : "structurally-valid";
  const asset = {
    version: VERSION,
    coastlineAssetVersion: VERSION,
    countryId: target.iso3,
    countryName: target.name,
    source: { geoJson: "/geo/publicgeocountries-simplified-35.json", featureName: sourceFeature.properties?.NAME ?? null },
    rings: rings.map(({ validation: _validation, ...ring }) => ring),
    runtimeRings: rings.map((ring) => ring.coordinates),
    coastlinePaths: rings.flatMap((ring) => ring.segments.filter((segment) => segment.kind === "coastline").map((segment) => segment.coordinates)),
    politicalPaths: rings.flatMap((ring) => ring.segments.filter((segment) => segment.kind === "political").map((segment) => segment.coordinates)),
    diagnostics,
    status,
    semanticValidation
  };
  const audit = { version: VERSION, countryId: target.iso3, status, rings: auditRings, validation: rings.map((ring) => ({ id: ring.id, ...ring.validation })), semanticValidation };
  const summary = { countryId: target.iso3, status, ringCount: rings.length, ...diagnostics, semanticValidation, rings: audit.validation };
  return { asset, audit, summary };
}

function buildRingAsset({ id, segments, flattened, sourceRing, denseCoastline }) {
  const coordinates = ensureClosed(dedupeCoordinates(flattened));
  const sourceShape = ringShapeMetrics(sourceRing);
  const generatedShape = ringShapeMetrics(coordinates);
  const politicalOriginal = segments.filter((segment) => segment.kind === "political").flatMap((segment) => segment.originalCoordinates ?? segment.coordinates);
  const politicalCurrent = segments.filter((segment) => segment.kind === "political").flatMap((segment) => segment.coordinates);
  const validation = {
    closed: sameCoordinate(coordinates[0], coordinates.at(-1)),
    duplicateConsecutivePointCount: countDuplicateConsecutive(coordinates),
    selfIntersectionCount: countSelfIntersections(coordinates),
    winding: signedRingArea(coordinates) >= 0 ? "counterclockwise" : "clockwise",
    segmentCount: segments.length,
    coastlineControlPointCount: segments.filter((segment) => segment.kind === "coastline").reduce((sum, segment) => sum + segment.coordinates.length, 0),
    politicalControlPointCount: segments.filter((segment) => segment.kind === "political").reduce((sum, segment) => sum + segment.coordinates.length, 0),
    junctionCount: segments.filter((segment) => segment.kind === "coastline").length * (segments.length > 1 ? 2 : 0),
    maxJunctionGapDegrees: maximumSegmentJunctionGap(segments),
    maxPreStitchJunctionGapDegrees: Math.max(0, ...segments.flatMap((segment) => segment.junctionGaps ?? [])),
    maxCoastlineDeviationModelUnits: maximumGeoPolylineDeviation(segments.filter((segment) => segment.kind === "coastline").flatMap((segment) => segment.validationCoordinates ?? segment.coordinates), denseCoastline),
    maxPoliticalDeviationDegrees: maximumPairedDeviation(politicalOriginal, politicalCurrent),
    sourceGeoJsonPointCount: sourceRing.length,
    shape: {
      source: sourceShape,
      generated: generatedShape,
      areaRatio: round(safeRatio(generatedShape.areaDegreesSquared, sourceShape.areaDegreesSquared)),
      centroidDistanceDegrees: round(geoDistance(sourceShape.centroid, generatedShape.centroid)),
      boundsWidthRatio: round(safeRatio(generatedShape.boundsWidthDegrees, sourceShape.boundsWidthDegrees)),
      boundsHeightRatio: round(safeRatio(generatedShape.boundsHeightDegrees, sourceShape.boundsHeightDegrees))
    }
  };
  return { id, closed: true, segments: segments.map(stripInternalSegment), coordinates, validation };
}

function buildCountrySemanticValidation({ target, rings }) {
  const issues = [];
  const add = (severity, code, ringId, message, details = {}) => issues.push({ severity, code, ringId, message, ...details });
  for (const ring of rings) {
    const coastlineSegments = ring.segments.filter((segment) => segment.kind === "coastline");
    const missingPhysical = coastlineSegments.filter((segment) => !segment.sourcePathId).length;
    if (missingPhysical) {
      add("error", "coastline-without-physical-provenance", ring.id, `${missingPhysical} coastline segment(s) use GeoJSON rather than a land.glb physical coastline component.`, { segmentCount: missingPhysical });
    }

    const gap = ring.validation.maxPreStitchJunctionGapDegrees;
    if (gap > 4) add("error", "large-pre-stitch-junction-gap", ring.id, `Coastline and political-border endpoints were ${round(gap)} degrees apart before stitching.`, { gapDegrees: round(gap) });
    else if (gap > 2.5) add("warning", "elevated-pre-stitch-junction-gap", ring.id, `Coastline and political-border endpoints were ${round(gap)} degrees apart before stitching.`, { gapDegrees: round(gap) });

    const shape = ring.validation.shape;
    const sourceDiagonal = Math.hypot(shape.source.boundsWidthDegrees, shape.source.boundsHeightDegrees);
    const centroidLimit = Math.max(3, sourceDiagonal * 0.45);
    if (shape.centroidDistanceDegrees > centroidLimit) {
      add("error", "silhouette-centroid-drift", ring.id, `Generated silhouette centroid drifted ${shape.centroidDistanceDegrees} degrees from the source polygon.`, { centroidDistanceDegrees: shape.centroidDistanceDegrees, limitDegrees: round(centroidLimit) });
    }
    if (shape.areaRatio < 0.25 || shape.areaRatio > 4) {
      add("error", "silhouette-area-ratio", ring.id, `Generated silhouette area ratio ${shape.areaRatio} is outside the structural safety range.`, { areaRatio: shape.areaRatio });
    } else if (shape.areaRatio < 0.45 || shape.areaRatio > 2.25) {
      add("warning", "silhouette-area-ratio", ring.id, `Generated silhouette area ratio ${shape.areaRatio} requires visual review.`, { areaRatio: shape.areaRatio });
    }
    if (shape.boundsWidthRatio > 3 || shape.boundsHeightRatio > 3 || shape.boundsWidthRatio < 0.25 || shape.boundsHeightRatio < 0.25) {
      add("error", "silhouette-bounds-ratio", ring.id, "Generated silhouette bounds differ radically from the source polygon.", { widthRatio: shape.boundsWidthRatio, heightRatio: shape.boundsHeightRatio });
    }
    if (shape.generated.rectangularity > 0.94 && shape.source.rectangularity < 0.82) {
      add("warning", "suspicious-rectangular-silhouette", ring.id, "Generated silhouette is unexpectedly rectangular compared with the source polygon.", { sourceRectangularity: shape.source.rectangularity, generatedRectangularity: shape.generated.rectangularity });
    }
    if (shape.generated.maxEdgeLengthDegrees > 20) {
      add("error", "large-geographic-edge", ring.id, `Generated silhouette contains a ${shape.generated.maxEdgeLengthDegrees}-degree edge that may cross open water or unrelated land.`, { edgeLengthDegrees: shape.generated.maxEdgeLengthDegrees });
    } else if (shape.generated.maxEdgeLengthDegrees > 12) {
      add("warning", "large-geographic-edge", ring.id, `Generated silhouette contains a ${shape.generated.maxEdgeLengthDegrees}-degree edge that requires visual review.`, { edgeLengthDegrees: shape.generated.maxEdgeLengthDegrees });
    }
  }
  return {
    statusDefinitions: STATUS_DEFINITIONS,
    approvedReferenceCountry: PRODUCTION_APPROVED_IDS.has(target.iso3),
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues
  };
}

function chooseIslandPath({ sourceRing, region, physicalPaths, ownership }) {
  if (region.sourcePhysicalPathId) {
    const forced = physicalPaths.find((path) => path.id === region.sourcePhysicalPathId && path.closed);
    if (!forced) throw new Error(`${region.id}: physical coastline path ${region.sourcePhysicalPathId} not found.`);
    return forced;
  }
  const candidates = physicalPaths
    .filter((path) => boundsOverlap(path.componentBounds, region.bounds) && path.closed)
    .map((path) => {
      const sourceToPath = averageNearestDistance(sourceRing, path.denseCoordinates);
      const ownershipPenalty = (1 - ownership(path.denseCoordinates)) * 4;
      if (!region.requireLocalPath) return { path, score: sourceToPath + ownershipPenalty };
      const pathToSource = averageNearestDistance(sampleEvenly(path.denseCoordinates, 96), sourceRing);
      const corridorOverflow = coastlineCorridorOverflow(sourceRing, path.denseCoordinates);
      return {
        path,
        sourceToPath,
        pathToSource,
        corridorOverflow,
        score: sourceToPath + pathToSource * 1.5 + ownershipPenalty
      };
    })
    .filter((candidate) => !region.requireLocalPath || (candidate.corridorOverflow <= 0 && candidate.pathToSource <= Math.max(4, candidate.sourceToPath * 4)));
  if (!candidates.length) throw new Error(`${region.id}: no ${region.requireLocalPath ? "local " : ""}physical coastline path.`);
  return candidates.sort((a, b) => a.score - b.score || a.path.id.localeCompare(b.path.id))[0].path;
}

function classifyRingRuns(sourceRing, edgeCounts, physicalPaths, ownership, coastalProximityDegrees = COASTAL_PROXIMITY_DEGREES, coastlineLatitudeMax = null, forceDatelineEdgesPolitical = false, forcePoliticalEdgeIndices = [], preserveLegacyClassification = false) {
  const ring = ensureClosed(sourceRing);
  const edgeKinds = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    const midpoint = geographicMidpoint(a, b);
    const nearest = nearestPhysicalPoint(midpoint, physicalPaths).distance;
    const shared = (edgeCounts.get(geoEdgeKey(a, b)) ?? 0) > 1;
    const atlasKind = ownership.classifyEdge?.(a, b) ?? "ambiguous";
    const outsideCoastLatitude = Number.isFinite(coastlineLatitudeMax) && midpoint[1] > coastlineLatitudeMax;
    const artificialDatelineEdge = forceDatelineEdgesPolitical && Math.abs(a[0]) >= 179.5 && Math.abs(b[0]) >= 179.5;
    const explicitlyPolitical = forcePoliticalEdgeIndices.includes(index);
    edgeKinds.push(
      shared || (!preserveLegacyClassification && atlasKind === "political") || outsideCoastLatitude || artificialDatelineEdge || explicitlyPolitical
        ? "political"
        : (preserveLegacyClassification || atlasKind !== "political") && nearest <= coastalProximityDegrees
          ? "coastline"
          : "ambiguous"
    );
  }
  for (let index = 0; index < edgeKinds.length; index += 1) {
    if (edgeKinds[index] !== "ambiguous") continue;
    const previous = edgeKinds[(index - 1 + edgeKinds.length) % edgeKinds.length];
    const next = edgeKinds[(index + 1) % edgeKinds.length];
    edgeKinds[index] = previous === next ? previous : "political";
  }
  const transition = edgeKinds.findIndex((kind, index) => kind !== edgeKinds[(index - 1 + edgeKinds.length) % edgeKinds.length]);
  const start = transition < 0 ? 0 : transition;
  const runs = [];
  for (let offset = 0; offset < edgeKinds.length; offset += 1) {
    const edgeIndex = (start + offset) % edgeKinds.length;
    const kind = edgeKinds[edgeIndex];
    const run = runs.at(-1);
    if (!run || run.kind !== kind) runs.push({ kind, edgeIndices: [edgeIndex] });
    else run.edgeIndices.push(edgeIndex);
  }
  return runs.map((run) => {
    const coordinates = [ring[run.edgeIndices[0]], ...run.edgeIndices.map((index) => ring[index + 1 === ring.length ? 0 : index + 1])];
    return { ...run, coordinates: coordinates.map(copyCoordinate) };
  });
}

function chooseCoastlineArc({ sourceCoordinates, physicalPaths, ownership, maxEndpointDistance = 3, maxSourceDeviation = null, candidateBounds = null, candidatePathIds = null, diverseEndpointCandidates = true, waypoints = [], waypointTolerance = 1.5, excludedEdges = new Set() }) {
  const candidates = [];
  const rejectionCounts = { endpoint: 0, overlap: 0, bounds: 0, waypoint: 0, corridor: 0, sourceDeviation: 0 };
  for (const physicalPath of physicalPaths) {
    if (Array.isArray(candidatePathIds) && !candidatePathIds.includes(physicalPath.id)) continue;
    const path = physicalPath.denseCoordinates;
    const startIndices = nearestCoordinateIndices(sourceCoordinates[0], path, 8, maxEndpointDistance, diverseEndpointCandidates);
    const endIndices = nearestCoordinateIndices(sourceCoordinates.at(-1), path, 8, maxEndpointDistance, diverseEndpointCandidates);
    if (!startIndices.length || !endIndices.length || startIndices[0].distance + endIndices[0].distance > maxEndpointDistance * 2.7) { rejectionCounts.endpoint += 1; continue; }
    for (const start of startIndices) for (const end of endIndices) for (const candidate of pathArcs(path, start.index, end.index, physicalPath.closed)) {
        if (candidate.coordinates.length < 2) continue;
        if (excludedEdges.size && physicalIndexEdgeKeys(physicalPath.id, candidate.indices).some((edge) => excludedEdges.has(edge))) { rejectionCounts.overlap += 1; continue; }
        if (Array.isArray(candidateBounds) && candidate.coordinates.some((coordinate) => !inBounds(coordinate, candidateBounds))) { rejectionCounts.bounds += 1; continue; }
        if (waypoints.some((waypoint) => geoDistance(waypoint, candidate.coordinates[nearestCoordinateIndex(waypoint, candidate.coordinates)]) > waypointTolerance)) { rejectionCounts.waypoint += 1; continue; }
        const corridorOverflow = coastlineCorridorOverflow(sourceCoordinates, candidate.coordinates);
        if (corridorOverflow > 0) { rejectionCounts.corridor += 1; continue; }
        const endpointGap = start.distance + end.distance;
        const sourceToArc = averageNearestDistance(sourceCoordinates, candidate.coordinates);
        const sourceMaximumDeviation = maximumNearestDistance(sourceCoordinates, candidate.coordinates);
        if (Number.isFinite(maxSourceDeviation) && sourceMaximumDeviation > maxSourceDeviation) { rejectionCounts.sourceDeviation += 1; continue; }
        const arcToSource = averageNearestDistance(sampleEvenly(candidate.coordinates, 48), sourceCoordinates);
        const ownershipPenalty = (1 - ownership(sampleEvenly(candidate.coordinates, 64))) * 5;
        const tangentPenalty = endpointTangentPenalty(sourceCoordinates, candidate.coordinates);
        const score = endpointGap * 0.7 + sourceToArc * 1.6 + arcToSource * 0.45 + ownershipPenalty + tangentPenalty * 0.025;
        candidates.push({ ...candidate, path: physicalPath, startIndex: start.index, endIndex: end.index, score });
      }
  }
  const best = candidates.sort((a, b) => a.score - b.score || a.path.id.localeCompare(b.path.id))[0];
  if (!best) throw new Error(`No GLB coastline arc matched a coastal GeoJSON span (${Object.entries(rejectionCounts).map(([key, value]) => `${key}=${value}`).join(", ")}).`);
  return best;
}

function pathArcs(path, startIndex, endIndex, closed) {
  if (!closed) {
    const direction = startIndex <= endIndex ? 1 : -1;
    const indices = [];
    for (let index = startIndex; direction > 0 ? index <= endIndex : index >= endIndex; index += direction) indices.push(index);
    return [{ coordinates: indices.map((index) => path[index]), indices, direction }];
  }
  const unique = sameCoordinate(path[0], path.at(-1)) ? path.slice(0, -1) : path;
  const walk = (direction) => {
    const coordinates = [];
    const indices = [];
    let index = startIndex % unique.length;
    while (coordinates.length <= unique.length) {
      coordinates.push(unique[index]);
      indices.push(index);
      if (index === endIndex % unique.length) break;
      index = (index + direction + unique.length) % unique.length;
    }
    return { coordinates: coordinates.map(copyCoordinate), indices, direction };
  };
  return [walk(1), walk(-1)];
}

function stitchJunctions(segments, junctions) {
  for (const segment of segments) {
    if (segment.kind === "political") segment.originalCoordinates = segment.coordinates.map(copyCoordinate);
    if (segment.kind === "coastline") segment.validationCoordinates = segment.coordinates.map(copyCoordinate);
  }
  const transitions = [];
  for (let index = 0; index < segments.length; index += 1) {
    const leftIndex = index, rightIndex = (index + 1) % segments.length;
    const left = segments[leftIndex], right = segments[rightIndex];
    if (left.kind === right.kind) continue;
    transitions.push({ leftIndex, rightIndex });
  }
  const originals = segments.map((segment) => segment.coordinates.map(copyCoordinate));
  let best = null;
  for (let mask = 0; mask < 2 ** transitions.length; mask += 1) {
    segments.forEach((segment, index) => { segment.coordinates = originals[index].map(copyCoordinate); });
    transitions.forEach(({ leftIndex, rightIndex }, transitionIndex) => {
      const left = segments[leftIndex], right = segments[rightIndex];
      const coastlinePoint = left.kind === "coastline" ? left.coordinates.at(-1) : right.coordinates[0];
      const politicalPoint = left.kind === "political" ? left.coordinates.at(-1) : right.coordinates[0];
      const usePhysical = Boolean(mask & (1 << transitionIndex));
      if (usePhysical) {
        if (left.kind === "political") left.coordinates[left.coordinates.length - 1] = copyCoordinate(coastlinePoint);
        else right.coordinates[0] = copyCoordinate(coastlinePoint);
      } else if (left.kind === "coastline") left.coordinates[left.coordinates.length - 1] = copyCoordinate(politicalPoint);
      else right.coordinates[0] = copyCoordinate(politicalPoint);
    });
    const intersections = countSelfIntersections(flattenSegments(segments));
    const score = intersections * 1000 + (transitions.length - bitCount(mask)) * 0.01;
    if (!best || score < best.score) best = { score, mask, coordinates: segments.map((segment) => segment.coordinates.map(copyCoordinate)) };
  }
  segments.forEach((segment, index) => { segment.coordinates = best.coordinates[index]; });
  transitions.forEach(({ leftIndex, rightIndex }, transitionIndex) => {
    const left = segments[leftIndex], right = segments[rightIndex];
    const sourceLeft = originals[leftIndex], sourceRight = originals[rightIndex];
    const coastlinePoint = left.kind === "coastline" ? sourceLeft.at(-1) : sourceRight[0];
    const politicalPoint = left.kind === "political" ? sourceLeft.at(-1) : sourceRight[0];
    const usePhysical = Boolean(best.mask & (1 << transitionIndex));
    const coordinate = usePhysical ? coastlinePoint : politicalPoint;
    const gap = geoDistance(coastlinePoint, politicalPoint);
    left.junctionGaps = [...(left.junctionGaps ?? []), gap];
    right.junctionGaps = [...(right.junctionGaps ?? []), gap];
    junctions.push({ coordinate: copyCoordinate(coordinate), sourceGlbCoordinate: copyCoordinate(coastlinePoint), sourceGeoJsonCoordinate: copyCoordinate(politicalPoint), canonicalSource: usePhysical ? "land.glb" : "geojson-junction", preStitchGapDegrees: round(gap) });
  });
}

function flattenSegments(segments) {
  const coordinates = [];
  for (const segment of segments) {
    for (const coordinate of segment.coordinates) {
      if (!sameCoordinate(coordinates.at(-1), coordinate)) coordinates.push(copyCoordinate(coordinate));
    }
  }
  return ensureClosed(coordinates);
}

function maximumSegmentJunctionGap(segments) { let maximum = 0; for (let index = 0; index < segments.length; index += 1) maximum = Math.max(maximum, geoDistance(segments[index].coordinates.at(-1), segments[(index + 1) % segments.length].coordinates[0])); return round(maximum); }

function preparePhysicalPath(path) {
  const denseCoordinates = ensureClosed(path.coordinates.map(roundCoordinate));
  const simplifiedCoordinates = simplifyGeoPath(denseCoordinates, SIMPLIFICATION_TOLERANCE, path.closed);
  const componentBounds = geoBounds(denseCoordinates);
  return {
    fingerprint: sha256(JSON.stringify(denseCoordinates)),
    closed: path.closed,
    seamStitched: path.seamStitched,
    denseCoordinates,
    simplifiedCoordinates,
    componentBounds,
    areaEstimate: Math.abs(signedRingArea(denseCoordinates)),
    densePointCount: denseCoordinates.length,
    simplifiedPointCount: simplifiedCoordinates.length,
    maximumDeviationModelUnits: round(maximumGeoPolylineDeviation(simplifiedCoordinates, denseCoordinates))
  };
}

function stripDensePhysicalPath({ fingerprint: _fingerprint, denseCoordinates: _dense, ...path }) { return path; }
function stripInternalSegment({ originalCoordinates: _original, validationCoordinates: _validation, junctionGaps: _gaps, ...segment }) { return segment; }

function validateCountryAsset(asset) {
  for (const ring of asset.rings) {
    if (!sameCoordinate(ring.coordinates[0], ring.coordinates.at(-1))) throw new Error(`${asset.countryId}/${ring.id}: open ring.`);
    if (countDuplicateConsecutive(ring.coordinates)) throw new Error(`${asset.countryId}/${ring.id}: duplicate consecutive points.`);
    const intersections = countSelfIntersections(ring.coordinates);
    if (intersections) throw new Error(`${asset.countryId}/${ring.id}: ${intersections} self intersections ${JSON.stringify(findSelfIntersections(ring.coordinates))}.`);
  }
}

function buildRadialLandMask({ width, height, geometry, faceScores }) {
  const pixels = new Uint8Array(width * height);
  const depth = new Float32Array(width * height);
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let face = 0; face < faceScores.length; face += 1) {
    if (faceScores[face] <= 0) continue;
    for (let corner = 0; corner < 3; corner += 1) readPoint(geometry.positions, geometry.indices[face * 3 + corner], points[corner]);
    rasterizeSphericalTriangle(points, pixels, depth, width, height);
  }
  return { width, height, pixels, landPixelCount: pixels.reduce((sum, value) => sum + value, 0) };
}

function rasterizeSphericalTriangle(points, pixels, depth, width, height) {
  const projected = points.map((point) => {
    const [lng, lat] = localToGeo(point);
    return { x: ((lng + 180) / 360) * width, y: ((90 - lat) / 180) * height };
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

function traceMaskBoundary({ width, height, pixels }) {
  const outgoing = new Map();
  const edgeKeys = new Set();
  const key = (x, y) => `${((x % width) + width) % width},${y}`;
  const isLand = (x, y) => y >= 0 && y < height && pixels[y * width + ((x % width) + width) % width] === 1;
  const add = (ax, ay, bx, by) => {
    const a = key(ax, ay);
    const b = key(bx, by);
    const edgeKey = `${a}>${b}`;
    if (edgeKeys.has(edgeKey)) return;
    edgeKeys.add(edgeKey);
    if (!outgoing.has(a)) outgoing.set(a, []);
    outgoing.get(a).push({ a, b, edgeKey });
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!isLand(x, y)) continue;
    if (!isLand(x, y - 1)) add(x, y, x + 1, y);
    if (!isLand(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!isLand(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!isLand(x - 1, y)) add(x, y + 1, x, y);
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.b.localeCompare(b.b));
  const unused = new Set(edgeKeys);
  const paths = [];
  while (unused.size) {
    const seedKey = [...unused].sort()[0];
    let edge = [...outgoing.values()].flat().find((candidate) => candidate.edgeKey === seedKey);
    const vertices = [edge.a];
    const start = edge.a;
    let seamStitched = false;
    while (edge && unused.has(edge.edgeKey)) {
      unused.delete(edge.edgeKey);
      vertices.push(edge.b);
      const [ax] = edge.a.split(",").map(Number);
      const [bx] = edge.b.split(",").map(Number);
      if (Math.abs(ax - bx) > width / 2) seamStitched = true;
      if (edge.b === start) break;
      edge = (outgoing.get(edge.b) ?? []).find((candidate) => unused.has(candidate.edgeKey));
    }
    const coordinates = vertices.map((vertex) => {
      const [x, y] = vertex.split(",").map(Number);
      return [(x / width) * 360 - 180, 90 - (y / height) * 180];
    });
    paths.push({ coordinates, closed: vertices.at(-1) === start, seamStitched });
  }
  return paths;
}

function normalizeTracedPath(path) {
  const coordinates = dedupeCoordinates(path.coordinates.map(roundCoordinate));
  if (path.closed && !sameCoordinate(coordinates[0], coordinates.at(-1))) coordinates.push(copyCoordinate(coordinates[0]));
  return { ...path, coordinates };
}

function calculateFaceOrientationScores(geometry) {
  const scores = new Float64Array(geometry.indices.length / 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), centroid = new THREE.Vector3();
  for (let face = 0; face < scores.length; face += 1) {
    readPoint(geometry.positions, geometry.indices[face * 3], a);
    readPoint(geometry.positions, geometry.indices[face * 3 + 1], b);
    readPoint(geometry.positions, geometry.indices[face * 3 + 2], c);
    normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3).normalize();
    scores[face] = normal.dot(centroid);
  }
  return scores;
}

function readGlb(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString("utf8", 0, 4) !== "glTF") throw new Error(`${filePath} is not a GLB.`);
  let offset = 12;
  let json;
  const binaryChunks = [];
  while (offset < bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString("utf8").replace(/[\u0000\s]+$/u, ""));
    if (chunkType === 0x004e4942) binaryChunks.push(data);
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("GLB JSON chunk is missing.");
  return { json, binaryChunks };
}

function collectGeometry(glb) {
  const parentByNode = new Map();
  glb.json.nodes?.forEach((node, nodeIndex) => node.children?.forEach((child) => parentByNode.set(child, nodeIndex)));
  const positions = [];
  const indices = [];
  for (let nodeIndex = 0; nodeIndex < (glb.json.nodes?.length ?? 0); nodeIndex += 1) {
    const node = glb.json.nodes[nodeIndex];
    if (node.mesh == null) continue;
    const matrix = resolveNodeWorldMatrix(glb.json, nodeIndex, parentByNode);
    for (const primitive of glb.json.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const sourcePositions = readAccessor(glb, primitive.attributes.POSITION);
      const sourceIndices = primitive.indices == null ? Array.from({ length: sourcePositions.length / 3 }, (_, index) => index) : Array.from(readAccessor(glb, primitive.indices));
      const vertexOffset = positions.length / 3;
      for (let index = 0; index < sourcePositions.length; index += 3) {
        const point = new THREE.Vector3(sourcePositions[index], sourcePositions[index + 1], sourcePositions[index + 2]).applyMatrix4(matrix);
        positions.push(point.x, point.y, point.z);
      }
      indices.push(...sourceIndices.map((index) => index + vertexOffset));
    }
  }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const binary = glb.binaryChunks[view.buffer ?? 0];
  const component = componentInfo(accessor.componentType);
  const itemSize = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type] ?? 1;
  const stride = view.byteStride ?? component.bytes * itemSize;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const output = new component.ArrayType(accessor.count * itemSize);
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  for (let item = 0; item < accessor.count; item += 1) for (let channel = 0; channel < itemSize; channel += 1) {
    output[item * itemSize + channel] = dataView[component.reader](start + item * stride + channel * component.bytes, true);
  }
  return output;
}

function componentInfo(componentType) {
  const result = {
    5120: { ArrayType: Int8Array, reader: "getInt8", bytes: 1 }, 5121: { ArrayType: Uint8Array, reader: "getUint8", bytes: 1 },
    5122: { ArrayType: Int16Array, reader: "getInt16", bytes: 2 }, 5123: { ArrayType: Uint16Array, reader: "getUint16", bytes: 2 },
    5125: { ArrayType: Uint32Array, reader: "getUint32", bytes: 4 }, 5126: { ArrayType: Float32Array, reader: "getFloat32", bytes: 4 }
  }[componentType];
  if (!result) throw new Error(`Unsupported accessor component ${componentType}.`);
  return result;
}

function resolveNodeWorldMatrix(json, nodeIndex, parentByNode) {
  const matrices = [];
  for (let current = nodeIndex; current != null; current = parentByNode.get(current)) matrices.unshift(nodeLocalMatrix(json.nodes[current]));
  return matrices.reduce((world, local) => world.multiply(local), new THREE.Matrix4());
}

function nodeLocalMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]), new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]));
}

function readRgbPng(filePath) {
  const bytes = fs.readFileSync(filePath);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), colorType = bytes[25], bitDepth = bytes[24];
  if (bitDepth !== 8 || colorType !== 2 || bytes[28] !== 0) throw new Error("Country ID atlas must be non-interlaced 8-bit RGB PNG.");
  const idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3, data = Buffer.alloc(stride * height);
  for (let y = 0, input = 0; y < height; y += 1) {
    const filter = inflated[input++];
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[input++], left = x >= 3 ? data[y * stride + x - 3] : 0, up = y ? data[(y - 1) * stride + x] : 0, upperLeft = y && x >= 3 ? data[(y - 1) * stride + x - 3] : 0;
      data[y * stride + x] = (raw + pngFilterPredictor(filter, left, up, upperLeft)) & 255;
    }
  }
  return { width, height, data };
}

function pngFilterPredictor(filter, left, up, upperLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) { const p = left + up - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft; }
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function createOwnershipSampler({ target, idAtlas, lookup }) {
  const entry = lookup.find((country) => country.iso3 === target.iso3);
  if (!entry) throw new Error(`${target.iso3}: country lookup entry missing.`);
  const expected = entry.rgb.join(",");
  const sampleClass = ([lng, lat]) => {
    const x = Math.min(idAtlas.width - 1, Math.max(0, Math.floor((((-wrapDegrees(lng)) + 180) / 360) * idAtlas.width)));
    const y = Math.min(idAtlas.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * idAtlas.height)));
    const offset = (y * idAtlas.width + x) * 3;
    const rgb = `${idAtlas.data[offset]},${idAtlas.data[offset + 1]},${idAtlas.data[offset + 2]}`;
    if (rgb === expected) return "target";
    if (rgb === "0,0,0") return "ocean";
    return "other";
  };
  const ownership = (coordinates) => {
    let matches = 0, samples = 0;
    for (const [lng, lat] of sampleEvenly(coordinates, 96)) {
      for (const [dx, dy] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25], [0.5, 0], [-0.5, 0]]) {
        if (sampleClass([lng + dx, lat + dy]) === "target") matches += 1;
        samples += 1;
      }
    }
    return samples ? matches / samples : 0;
  };
  ownership.classifyEdge = (a, b) => {
    const midpoint = geographicMidpoint(a, b);
    const latitudeScale = Math.max(0.2, Math.cos(THREE.MathUtils.degToRad(midpoint[1])));
    const deltaLongitude = wrapDegrees(b[0] - a[0]) * latitudeScale;
    const deltaLatitude = b[1] - a[1];
    const length = Math.hypot(deltaLongitude, deltaLatitude);
    if (length <= 1e-8) return "ambiguous";
    const normalLongitude = -deltaLatitude / length / latitudeScale;
    const normalLatitude = deltaLongitude / length;
    const sides = [-1, 1].map((side) => [0.12, 0.3, 0.6].map((distance) => sampleClass([
      midpoint[0] + normalLongitude * distance * side,
      midpoint[1] + normalLatitude * distance * side
    ])));
    const targetSides = sides.map((samples) => samples.filter((kind) => kind === "target").length);
    const targetSide = targetSides[0] === targetSides[1] ? -1 : targetSides[0] > targetSides[1] ? 0 : 1;
    if (targetSide < 0 || targetSides[targetSide] === 0) return "ambiguous";
    const opposite = sides[1 - targetSide];
    const oceanCount = opposite.filter((kind) => kind === "ocean").length;
    const otherCount = opposite.filter((kind) => kind === "other").length;
    if (oceanCount > otherCount && oceanCount >= 2) return "coastline";
    if (otherCount > oceanCount && otherCount >= 2) return "political";
    return "ambiguous";
  };
  return ownership;
}

function simplifyGeoPath(coordinates, tolerance, closed) {
  const points = coordinates.map(geoToVector);
  const simplified = closed ? simplifyClosed3d(points, tolerance) : rdp3d(points, tolerance);
  return simplified.map((point) => roundCoordinate(localToGeo(point)));
}

function simplifyGeoPathPreservingJunctions(coordinates, tolerance) {
  const simplified = simplifyGeoPath(coordinates, tolerance, false);
  const keep = new Set(simplified.map((coordinate) => coordinateKey(coordinate)));
  const neighborhood = Math.min(12, Math.floor(coordinates.length / 3));
  return coordinates
    .filter((coordinate, index) => index < neighborhood || index >= coordinates.length - neighborhood || keep.has(coordinateKey(roundCoordinate(coordinate))))
    .map(roundCoordinate);
}

function simplifyClosed3d(points, tolerance) {
  const working = points.length > 1 && points[0].distanceToSquared(points.at(-1)) < 1e-16 ? points.slice(0, -1) : points.slice();
  if (working.length < 4) return ensureClosed(working.map((point) => localToGeo(point))).map(geoToVector);
  let first = 0, second = 1, maximum = 0;
  for (let i = 0; i < working.length; i += 1) for (let j = i + 1; j < working.length; j += 1) {
    const distance = working[i].distanceToSquared(working[j]);
    if (distance > maximum) { maximum = distance; first = i; second = j; }
  }
  const combined = [...rdp3d(cyclicSlice(working, first, second), tolerance).slice(0, -1), ...rdp3d(cyclicSlice(working, second, first), tolerance).slice(0, -1)];
  combined.push(combined[0].clone());
  return combined;
}

function cyclicSlice(points, start, end) { const result = [points[start]]; for (let index = start; index !== end;) { index = (index + 1) % points.length; result.push(points[index]); } return result; }
function rdp3d(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maximum = -1, split = -1;
  for (let index = 1; index < points.length - 1; index += 1) { const distance = pointSegmentDistance(points[index], points[0], points.at(-1)); if (distance > maximum) { maximum = distance; split = index; } }
  if (maximum <= tolerance) return [points[0], points.at(-1)];
  return [...rdp3d(points.slice(0, split + 1), tolerance).slice(0, -1), ...rdp3d(points.slice(split), tolerance)];
}

function maximumGeoPolylineDeviation(simplifiedCoordinates, denseCoordinates) {
  if (!simplifiedCoordinates.length || !denseCoordinates.length) return 0;
  const simplified = simplifiedCoordinates.map(geoToVector), dense = denseCoordinates.map(geoToVector);
  let maximum = 0;
  for (const point of dense) {
    let minimum = Infinity;
    for (let index = 1; index < simplified.length; index += 1) minimum = Math.min(minimum, pointSegmentDistance(point, simplified[index - 1], simplified[index]));
    maximum = Math.max(maximum, minimum);
  }
  return round(maximum);
}

function pointSegmentDistance(point, a, b) { const segment = new THREE.Vector3().subVectors(b, a); const lengthSq = segment.lengthSq(); const t = lengthSq ? THREE.MathUtils.clamp(new THREE.Vector3().subVectors(point, a).dot(segment) / lengthSq, 0, 1) : 0; return point.distanceTo(new THREE.Vector3().copy(a).addScaledVector(segment, t)); }
function geoToVector([lng, lat]) { const lon = THREE.MathUtils.degToRad(-lng + 90), phi = THREE.MathUtils.degToRad(lat), cos = Math.cos(phi); return new THREE.Vector3(cos * Math.cos(lon), Math.sin(phi), cos * Math.sin(lon)).multiplyScalar(RADIUS); }
function localToGeo(point) { const p = point.clone().normalize(); return [wrapDegrees(-(THREE.MathUtils.radToDeg(Math.atan2(p.z, p.x)) - 90)), THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)))]; }
function maskPixelToLocalDirection(x, y, width, height) { return geoToVector([(x / width) * 360 - 180, 90 - (y / height) * 180]).normalize(); }

function rayTriangleDistance(direction, a, b, c) {
  const edge1 = new THREE.Vector3().subVectors(b, a), edge2 = new THREE.Vector3().subVectors(c, a), p = new THREE.Vector3().crossVectors(direction, edge2), determinant = edge1.dot(p);
  if (Math.abs(determinant) < 1e-10) return null;
  const inverse = 1 / determinant, tVector = a.clone().multiplyScalar(-1), u = tVector.dot(p) * inverse;
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const q = new THREE.Vector3().crossVectors(tVector, edge1), v = direction.dot(q) * inverse;
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const distance = edge2.dot(q) * inverse;
  return distance > 0 ? distance : null;
}

function geometryRings(geometry) { return (!geometry ? [] : geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : []).flatMap((polygon) => polygon.map((ring) => ensureClosed(ring.map(copyCoordinate)))); }
function chooseRegionalRing(rings, bounds) { const candidates = rings.filter((ring) => ring.some((point) => inBounds(point, bounds))); if (!candidates.length) throw new Error("Regional GeoJSON ring not found."); return candidates.sort((a, b) => b.length - a.length)[0]; }
function findFeature(features, iso3) { return features.find((feature) => feature.properties?.ISO_A3 === iso3 || feature.properties?.ADM0_A3 === iso3); }
function buildGeoJsonEdgeCounts(features) { const counts = new Map(); for (const feature of features) for (const ring of geometryRings(feature.geometry)) for (let index = 0; index < ring.length - 1; index += 1) { const key = geoEdgeKey(ring[index], ring[index + 1]); counts.set(key, (counts.get(key) ?? 0) + 1); } return counts; }
function inferNeighborId(run, features, countryId) { const matches = new Set(); for (const feature of features) { const iso3 = feature.properties?.ISO_A3; if (!iso3 || iso3 === countryId) continue; const keys = new Set(geometryRings(feature.geometry).flatMap((ring) => ring.slice(0, -1).map((point, index) => geoEdgeKey(point, ring[index + 1])))); if (run.edgeIndices.some((_, index) => keys.has(geoEdgeKey(run.coordinates[index], run.coordinates[index + 1])))) matches.add(iso3); } return matches.size === 1 ? [...matches][0] : undefined; }
function geoEdgeKey(a, b) { const p = `${round(a[0], 5)},${round(a[1], 5)}`, q = `${round(b[0], 5)},${round(b[1], 5)}`; return p < q ? `${p}|${q}` : `${q}|${p}`; }
function physicalIndexEdgeKeys(pathId, indices) { return indices.slice(0, -1).map((index, offset) => `${pathId}:${Math.min(index, indices[offset + 1])}-${Math.max(index, indices[offset + 1])}`); }
function nearestPhysicalPoint(coordinate, paths) { let best = null, distance = Infinity; for (const path of paths) for (const candidate of path.denseCoordinates) { const next = geoDistance(coordinate, candidate); if (next < distance) { distance = next; best = candidate; } } return { coordinate: best, distance }; }
function nearestCoordinateIndex(coordinate, coordinates) { let result = 0, distance = Infinity; coordinates.forEach((candidate, index) => { const next = geoDistance(coordinate, candidate); if (next < distance) { distance = next; result = index; } }); return result; }
function nearestCoordinateIndices(coordinate, coordinates, limit, maximumDistance, diverse = true) {
  const sorted = coordinates
    .map((candidate, index) => ({ index, distance: geoDistance(coordinate, candidate) }))
    .filter((item) => item.distance <= maximumDistance)
    .sort((a, b) => a.distance - b.distance || a.index - b.index);
  const cutoff = Math.min(maximumDistance, (sorted[0]?.distance ?? maximumDistance) + Math.max(0.75, maximumDistance * 0.45));
  if (!diverse) return sorted.filter((item) => item.distance <= Math.min(maximumDistance, (sorted[0]?.distance ?? maximumDistance) + 0.75)).slice(0, limit);
  const selected = [];
  const minimumIndexSeparation = 18;
  for (const item of sorted) {
    if (item.distance > cutoff) break;
    if (selected.some((candidate) => Math.abs(candidate.index - item.index) < minimumIndexSeparation)) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}
function endpointTangentPenalty(source, candidate) { const offset = Math.min(8, candidate.length - 1); return directionDifference(source[0], source[Math.min(1, source.length - 1)], candidate[0], candidate[offset]) + directionDifference(source[Math.max(0, source.length - 2)], source.at(-1), candidate[Math.max(0, candidate.length - 1 - offset)], candidate.at(-1)); }
function directionDifference(a, b, c, d) { const vector = (p, q) => { const lat = THREE.MathUtils.degToRad((p[1] + q[1]) / 2); return new THREE.Vector2(wrapDegrees(q[0] - p[0]) * Math.cos(lat), q[1] - p[1]).normalize(); }; const first = vector(a, b), second = vector(c, d); return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(first.dot(second), -1, 1))); }
function averageNearestDistance(source, candidates) { const sampled = sampleEvenly(source, 64); return sampled.reduce((sum, point) => sum + geoDistance(point, candidates[nearestCoordinateIndex(point, candidates)]), 0) / Math.max(1, sampled.length); }
function maximumNearestDistance(source, candidates) { return sampleEvenly(source, 64).reduce((maximum, point) => Math.max(maximum, geoDistance(point, candidates[nearestCoordinateIndex(point, candidates)])), 0); }
function coastlineCorridorOverflow(sourceCoordinates, candidateCoordinates) {
  const source = sourceCoordinates.map(copyCoordinate);
  const sampled = sampleEvenly(candidateCoordinates, 96);
  const referenceLongitude = source[0]?.[0] ?? 0;
  const unwrap = (longitude) => referenceLongitude + wrapDegrees(longitude - referenceLongitude);
  const sourceLongitudes = source.map((coordinate) => unwrap(coordinate[0]));
  const sourceLatitudes = source.map((coordinate) => coordinate[1]);
  const longitudeSpan = Math.max(...sourceLongitudes) - Math.min(...sourceLongitudes);
  const latitudeSpan = Math.max(...sourceLatitudes) - Math.min(...sourceLatitudes);
  const margin = Math.max(6, Math.hypot(longitudeSpan, latitudeSpan) * 0.65);
  const minLongitude = Math.min(...sourceLongitudes) - margin;
  const maxLongitude = Math.max(...sourceLongitudes) + margin;
  const minLatitude = Math.min(...sourceLatitudes) - margin;
  const maxLatitude = Math.max(...sourceLatitudes) + margin;
  return sampled.reduce((maximum, coordinate) => {
    const longitude = unwrap(coordinate[0]);
    const overflow = Math.max(
      minLongitude - longitude,
      longitude - maxLongitude,
      minLatitude - coordinate[1],
      coordinate[1] - maxLatitude,
      0
    );
    return Math.max(maximum, overflow);
  }, 0);
}
function sampleEvenly(coordinates, limit) { if (coordinates.length <= limit) return coordinates; return Array.from({ length: limit }, (_, index) => coordinates[Math.floor((index / (limit - 1)) * (coordinates.length - 1))]); }
function geographicMidpoint(a, b) { let delta = wrapDegrees(b[0] - a[0]); return [wrapDegrees(a[0] + delta / 2), (a[1] + b[1]) / 2]; }
function geoDistance(a, b) { const lat = THREE.MathUtils.degToRad((a[1] + b[1]) / 2); return Math.hypot(wrapDegrees(a[0] - b[0]) * Math.cos(lat), a[1] - b[1]); }
function orientClosedPath(coordinates, sourceRing) { const current = signedRingArea(coordinates), source = signedRingArea(sourceRing); return Math.sign(current) === Math.sign(source) ? coordinates.map(copyCoordinate) : ensureClosed(coordinates.slice(0, -1).reverse().map(copyCoordinate)); }
function pathDirection(source, oriented) { return sameCoordinate(source[0], oriented[0]) && sameCoordinate(source[1], oriented[1]) ? 1 : -1; }
function ensureClosed(coordinates) { const result = coordinates.map(copyCoordinate); if (result.length && !sameCoordinate(result[0], result.at(-1))) result.push(copyCoordinate(result[0])); return result; }
function dedupeCoordinates(coordinates) { const result = []; for (const coordinate of coordinates) if (!sameCoordinate(result.at(-1), coordinate)) result.push(copyCoordinate(coordinate)); return result; }
function copyCoordinate(coordinate) { return [Number(coordinate[0]), Number(coordinate[1])]; }
function sameCoordinate(a, b, epsilon = 1e-8) { return Boolean(a && b && Math.abs(wrapDegrees(a[0] - b[0])) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon); }
function coordinateKey(coordinate) { return `${round(wrapDegrees(coordinate[0]))},${round(coordinate[1])}`; }
function countDuplicateConsecutive(coordinates) { let count = 0; for (let index = 1; index < coordinates.length; index += 1) if (sameCoordinate(coordinates[index - 1], coordinates[index])) count += 1; return count; }
function unwrapLongitudes(coordinates, referenceLongitude = coordinates[0]?.[0] ?? 0) {
  if (!coordinates.length) return [];
  const result = [[referenceLongitude + wrapDegrees(coordinates[0][0] - referenceLongitude), coordinates[0][1]]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previousLongitude = result[index - 1][0];
    result.push([previousLongitude + wrapDegrees(coordinates[index][0] - previousLongitude), coordinates[index][1]]);
  }
  return result;
}
function signedRingArea(coordinates) { let area = 0; const unwrapped = unwrapLongitudes(coordinates); for (let index = 0; index < unwrapped.length - 1; index += 1) area += unwrapped[index][0] * unwrapped[index + 1][1] - unwrapped[index + 1][0] * unwrapped[index][1]; return area / 2; }
function countSelfIntersections(coordinates) { const unwrapped = unwrapLongitudes(coordinates); let count = 0; for (let a = 0; a < unwrapped.length - 1; a += 1) for (let b = a + 2; b < unwrapped.length - 1; b += 1) { if (a === 0 && b === unwrapped.length - 2) continue; if (segmentsIntersect(unwrapped[a], unwrapped[a + 1], unwrapped[b], unwrapped[b + 1])) count += 1; } return count; }
function findSelfIntersections(coordinates) { const unwrapped = unwrapLongitudes(coordinates); const result = []; for (let a = 0; a < unwrapped.length - 1; a += 1) for (let b = a + 2; b < unwrapped.length - 1; b += 1) { if (a === 0 && b === unwrapped.length - 2) continue; if (segmentsIntersect(unwrapped[a], unwrapped[a + 1], unwrapped[b], unwrapped[b + 1])) result.push({ a, b, first: [coordinates[a], coordinates[a + 1]], second: [coordinates[b], coordinates[b + 1]] }); } return result; }
function segmentsIntersect(a, b, c, d) { const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b); return o1 * o2 < -1e-10 && o3 * o4 < -1e-10; }
function ringShapeMetrics(coordinates) {
  const closed = ensureClosed(coordinates);
  const unwrapped = unwrapLongitudes(closed);
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  let maxEdgeLengthDegrees = 0;
  for (let index = 0; index < unwrapped.length - 1; index += 1) {
    const current = unwrapped[index];
    const next = unwrapped[index + 1];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    centroidX += (current[0] + next[0]) * cross;
    centroidY += (current[1] + next[1]) * cross;
    maxEdgeLengthDegrees = Math.max(maxEdgeLengthDegrees, geoDistance(closed[index], closed[index + 1]));
  }
  const area = Math.abs(twiceArea / 2);
  let centroid;
  if (Math.abs(twiceArea) > 1e-10) centroid = [wrapDegrees(centroidX / (3 * twiceArea)), centroidY / (3 * twiceArea)];
  else {
    const unique = closed.slice(0, -1);
    centroid = [wrapDegrees(unique.reduce((sum, point) => sum + point[0], 0) / Math.max(1, unique.length)), unique.reduce((sum, point) => sum + point[1], 0) / Math.max(1, unique.length)];
  }
  const bounds = geoBounds(closed);
  const boundsWidthDegrees = Math.max(0, bounds[2] - bounds[0]);
  const boundsHeightDegrees = Math.max(0, bounds[3] - bounds[1]);
  return {
    bounds,
    boundsWidthDegrees: round(boundsWidthDegrees),
    boundsHeightDegrees: round(boundsHeightDegrees),
    areaDegreesSquared: round(area),
    centroid: roundCoordinate(centroid),
    rectangularity: round(area / Math.max(1e-9, boundsWidthDegrees * boundsHeightDegrees)),
    maxEdgeLengthDegrees: round(maxEdgeLengthDegrees)
  };
}
function safeRatio(numerator, denominator) { if (denominator > 1e-9) return numerator / denominator; return numerator <= 1e-9 ? 1 : 1e9; }
function maximumPairedDeviation(source, current) { let maximum = 0; for (let index = 0; index < Math.min(source.length, current.length); index += 1) maximum = Math.max(maximum, geoDistance(source[index], current[index])); return round(maximum); }
function geoBounds(coordinates) { const center = coordinates.reduce((sum, point) => sum + point[0], 0) / Math.max(1, coordinates.length); const lng = coordinates.map((point) => center + wrapDegrees(point[0] - center)); return [round(Math.min(...lng)), round(Math.min(...coordinates.map((point) => point[1]))), round(Math.max(...lng)), round(Math.max(...coordinates.map((point) => point[1])))]; }
function inBounds([lng, lat], [west, south, east, north]) { return lng >= west && lng <= east && lat >= south && lat <= north; }
function boundsOverlap(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
function comparePhysicalPaths(a, b) { return b.areaEstimate - a.areaEstimate || a.componentBounds.join(",").localeCompare(b.componentBounds.join(",")) || a.fingerprint.localeCompare(b.fingerprint); }
function readPoint(positions, index, target) { return target.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]); }
function wrapDegrees(value) { return ((((value + 180) % 360) + 360) % 360) - 180; }
function round(value, digits = 7) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function bitCount(value) { let count = 0; for (let current = value; current; current >>>= 1) count += current & 1; return count; }
function roundCoordinate([lng, lat]) { return [round(wrapDegrees(lng)), round(lat)]; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableJson(value) { return `${JSON.stringify(value)}\n`; }
function relativePath(filePath) { return path.relative(ROOT_DIR, filePath).replaceAll("\\", "/"); }

function findDuplicatePhysicalCoastlineAssignments(assets, physicalPaths) {
  const pathsById = new Map(physicalPaths.map((physicalPath) => [physicalPath.id, physicalPath]));
  const ownersByEdge = new Map();
  for (const asset of assets) {
    for (const segment of asset.rings.flatMap((ring) => ring.segments).filter((candidate) => candidate.kind === "coastline" && candidate.sourcePathId)) {
      const physicalPath = pathsById.get(segment.sourcePathId);
      if (!physicalPath) continue;
      for (const edgeKey of physicalSegmentEdgeKeys(segment, physicalPath)) {
        const owners = ownersByEdge.get(edgeKey) ?? new Set();
        owners.add(asset.countryId);
        ownersByEdge.set(edgeKey, owners);
      }
    }
  }
  const overlaps = new Map();
  for (const [edgeKey, owners] of ownersByEdge) {
    if (owners.size < 2) continue;
    const pathId = edgeKey.slice(0, edgeKey.lastIndexOf(":"));
    const countries = [...owners].sort();
    for (let first = 0; first < countries.length - 1; first += 1) {
      for (let second = first + 1; second < countries.length; second += 1) {
        const key = `${pathId}:${countries[first]}:${countries[second]}`;
        const entry = overlaps.get(key) ?? { pathId, countries: [countries[first], countries[second]], overlapEdgeCount: 0 };
        entry.overlapEdgeCount += 1;
        overlaps.set(key, entry);
      }
    }
  }
  return [...overlaps.values()].sort((a, b) => b.overlapEdgeCount - a.overlapEdgeCount || a.pathId.localeCompare(b.pathId) || a.countries.join(",").localeCompare(b.countries.join(",")));
}

function findUnexpectedCountryContainments(assets, sourceFeatures) {
  const sourceById = new Map(sourceFeatures.map((feature) => [featureIso3(feature), feature]));
  const centroids = new Map(assets.map((asset) => {
    const rings = geometryRings(sourceById.get(asset.countryId)?.geometry);
    const largest = rings.sort((a, b) => Math.abs(signedRingArea(b)) - Math.abs(signedRingArea(a)))[0] ?? [];
    return [asset.countryId, ringShapeMetrics(largest).centroid];
  }));
  const result = [];
  for (const asset of assets) {
    const sourceRings = geometryRings(sourceById.get(asset.countryId)?.geometry);
    for (const [otherCountryId, centroid] of centroids) {
      if (otherCountryId === asset.countryId) continue;
      const generatedContains = asset.runtimeRings.some((ring) => pointInRing(centroid, ring));
      if (!generatedContains) continue;
      const sourceContains = sourceRings.some((ring) => pointInRing(centroid, ring));
      if (!sourceContains) result.push({ countryId: asset.countryId, containedCountryId: otherCountryId, centroid });
    }
  }
  return result;
}

function findSuspiciousDisconnectedFragments(assets) {
  const result = [];
  for (const asset of assets) {
    if (asset.runtimeRings.length < 2) continue;
    const metrics = asset.runtimeRings.map((ring, ringIndex) => ({ ringIndex, ...ringShapeMetrics(ring) })).sort((a, b) => b.areaDegreesSquared - a.areaDegreesSquared);
    const largest = metrics[0];
    for (const fragment of metrics.slice(1)) {
      const areaRatio = safeRatio(fragment.areaDegreesSquared, largest.areaDegreesSquared);
      const centroidDistanceDegrees = geoDistance(fragment.centroid, largest.centroid);
      if (areaRatio > 0.3 && centroidDistanceDegrees > 20) {
        result.push({ countryId: asset.countryId, ringIndex: fragment.ringIndex, areaRatio: round(areaRatio), centroidDistanceDegrees: round(centroidDistanceDegrees), bounds: fragment.bounds });
      }
    }
  }
  return result;
}

function pointInRing(point, coordinates) {
  const ring = unwrapLongitudes(ensureClosed(coordinates), point[0]);
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let first = 0, second = ring.length - 1; first < ring.length; second = first, first += 1) {
    const a = ring[first];
    const b = ring[second];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function physicalSegmentEdgeKeys(segment, physicalPath) {
  const dense = physicalPath.denseCoordinates;
  const uniqueCount = physicalPath.closed ? Math.max(0, dense.length - 1) : dense.length;
  if (uniqueCount < 2) return [];
  if (physicalPath.closed && segment.startIndex === 0 && segment.endIndex === dense.length - 1) {
    return Array.from({ length: uniqueCount }, (_, index) => `${physicalPath.id}:${Math.min(index, (index + 1) % uniqueCount)}-${Math.max(index, (index + 1) % uniqueCount)}`);
  }
  const direction = segment.direction === -1 ? -1 : 1;
  const endIndex = ((segment.endIndex % uniqueCount) + uniqueCount) % uniqueCount;
  let current = ((segment.startIndex % uniqueCount) + uniqueCount) % uniqueCount;
  const result = [];
  for (let guard = 0; guard < uniqueCount; guard += 1) {
    if (current === endIndex) break;
    const next = physicalPath.closed ? (current + direction + uniqueCount) % uniqueCount : current + direction;
    if (next < 0 || next >= uniqueCount) break;
    result.push(`${physicalPath.id}:${Math.min(current, next)}-${Math.max(current, next)}`);
    current = next;
  }
  return result;
}
