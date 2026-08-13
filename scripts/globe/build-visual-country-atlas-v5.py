#!/usr/bin/env python3
"""Build the facet-aware 8K Visual Country Atlas v5.

The country ID atlas remains the authority for country ownership. This script
projects every triangle in ``land.glb`` into the globe's equirectangular UV
space, assigns the triangle to the most frequent non-background ID-atlas
color beneath it, then renders that complete facet at 8192x4096. Facets too
thin to cover a source pixel inherit an ID-derived owner from adjacent facets.

Requires Pillow. Run from anywhere with:

    python scripts/globe/build-visual-country-atlas-v5.py
    python scripts/globe/build-visual-country-atlas-v5.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


SOURCE_SIZE = (4096, 2048)
OUTPUT_SIZE = (8192, 4096)
PREVIEW_SIZE = SOURCE_SIZE
BACKGROUND_RGB = (0, 0, 0)
EXPECTED_SOURCE_SHA256 = {
    "land.glb": "abb09df654a20f8d4a144f9297733ce36b64d22698ebd84339c41f3159972378",
    "countryIdTexture.png": "efb41c81ab9d72419ba0b54968f1bf9becff4be1325b42e8605978fdceb32300",
    "countryLookup.json": "d1a037c3bd496b96bb49737fc649a922e8180627d4b315e220d31b20c743175e",
}


@dataclass(frozen=True)
class Facet:
    index: int
    vertex_indices: tuple[int, int, int]
    vertex_keys: tuple[tuple[float, float], tuple[float, float], tuple[float, float]]
    uv: tuple[tuple[float, float], tuple[float, float], tuple[float, float]]
    area: float


@dataclass(frozen=True)
class Ownership:
    rgb: tuple[int, int, int]
    method: str
    sample_count: int
    confidence: float
    runner_up_share: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify existing v5 files against a deterministic rebuild without rewriting them",
    )
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="allow intentional source asset changes after manually auditing them",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_source_hashes(paths: Iterable[Path], allow_source_drift: bool) -> dict[str, str]:
    hashes = {path.name: sha256(path) for path in paths}
    mismatches = {
        name: {"expected": EXPECTED_SOURCE_SHA256[name], "actual": actual}
        for name, actual in hashes.items()
        if EXPECTED_SOURCE_SHA256.get(name) != actual
    }
    if mismatches and not allow_source_drift:
        raise RuntimeError(
            "Atlas inputs changed; audit the drift or rerun with --allow-source-drift:\n"
            + json.dumps(mismatches, indent=2)
        )
    return hashes


def load_glb(path: Path) -> tuple[dict[str, object], bytes]:
    payload = path.read_bytes()
    if len(payload) < 20 or payload[:4] != b"glTF":
        raise RuntimeError(f"{path.name} is not a binary glTF file")
    version, declared_length = struct.unpack_from("<II", payload, 4)
    if version != 2 or declared_length != len(payload):
        raise RuntimeError(f"Unsupported or truncated GLB header in {path.name}")

    offset = 12
    document: dict[str, object] | None = None
    binary = b""
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        chunk = payload[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.rstrip(b" \t\r\n\0").decode("utf-8"))
        elif chunk_type == 0x004E4942:
            binary = chunk
    if document is None or not binary:
        raise RuntimeError(f"{path.name} does not contain JSON and BIN chunks")
    return document, binary


COMPONENT_FORMATS = {
    5121: ("B", 1),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
TYPE_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_accessor(document: dict[str, object], binary: bytes, accessor_index: int) -> list[object]:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    component_format, component_size = COMPONENT_FORMATS[accessor["componentType"]]
    component_count = TYPE_COMPONENTS[accessor["type"]]
    packed_size = component_size * component_count
    stride = view.get("byteStride", packed_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    unpack_format = "<" + component_format * component_count
    values: list[object] = []
    for item_index in range(accessor["count"]):
        components = struct.unpack_from(unpack_format, binary, start + item_index * stride)
        values.append(components[0] if component_count == 1 else components)
    return values


def load_land_geometry(path: Path) -> tuple[list[tuple[float, float, float]], list[int]]:
    document, binary = load_glb(path)
    primitives = [primitive for mesh in document["meshes"] for primitive in mesh["primitives"]]
    candidates = [
        primitive
        for primitive in primitives
        if "POSITION" in primitive.get("attributes", {}) and "indices" in primitive
    ]
    if len(candidates) != 1:
        raise RuntimeError(f"Expected one indexed POSITION primitive in {path.name}, found {len(candidates)}")
    primitive = candidates[0]
    positions = read_accessor(document, binary, primitive["attributes"]["POSITION"])
    indices = read_accessor(document, binary, primitive["indices"])
    if len(indices) % 3:
        raise RuntimeError("Land index buffer is not triangular")
    return positions, indices


def position_to_uv(position: tuple[float, float, float]) -> tuple[float, float]:
    x, y, z = position
    radius = math.sqrt(x * x + y * y + z * z)
    lon = -(math.atan2(z, x) - math.pi / 2)
    lon = (lon + math.pi) % (2 * math.pi) - math.pi
    lat = math.asin(max(-1.0, min(1.0, y / radius)))
    return ((lon + math.pi) / (2 * math.pi), 1.0 - (lat + math.pi / 2) / math.pi)


def unwrap_seam(uv: list[tuple[float, float]]) -> list[tuple[float, float]]:
    us = [point[0] for point in uv]
    if max(us) - min(us) <= 0.5:
        return uv
    return [(u + 1.0 if u < 0.5 else u, v) for u, v in uv]


def triangle_area(points: tuple[tuple[float, float], ...]) -> float:
    (x1, y1), (x2, y2), (x3, y3) = points
    return abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) * 0.5


def build_facets(
    positions: list[tuple[float, float, float]], indices: list[int]
) -> list[Facet]:
    facets: list[Facet] = []
    for facet_index in range(0, len(indices), 3):
        vertex_indices = tuple(indices[facet_index : facet_index + 3])
        canonical_uv = [position_to_uv(positions[index]) for index in vertex_indices]
        uv = tuple(unwrap_seam(canonical_uv))
        facets.append(
            Facet(
                index=facet_index // 3,
                vertex_indices=vertex_indices,
                vertex_keys=tuple((round(u % 1.0, 9), round(v, 9)) for u, v in canonical_uv),
                uv=uv,
                area=triangle_area(uv),
            )
        )
    return facets


def sample_facet(
    facet: Facet,
    id_pixels: object,
    valid_colors: set[tuple[int, int, int]],
) -> Ownership | None:
    width, height = SOURCE_SIZE
    points = [(u * width, v * height) for u, v in facet.uv]
    min_x = math.floor(min(x for x, _ in points))
    max_x = math.ceil(max(x for x, _ in points))
    min_y = max(0, math.floor(min(y for _, y in points)))
    max_y = min(height - 1, math.ceil(max(y for _, y in points)))
    if max_x < min_x or max_y < min_y:
        return None

    mask = Image.new("1", (max_x - min_x + 1, max_y - min_y + 1))
    local_points = [(x - min_x, y - min_y) for x, y in points]
    ImageDraw.Draw(mask).polygon(local_points, fill=1)
    counts: Counter[tuple[int, int, int]] = Counter()
    mask_pixels = mask.load()
    for local_y in range(mask.height):
        atlas_y = min_y + local_y
        for local_x in range(mask.width):
            if not mask_pixels[local_x, local_y]:
                continue
            color = id_pixels[(min_x + local_x) % width, atlas_y]
            if color != BACKGROUND_RGB and color in valid_colors:
                counts[color] += 1
    if not counts:
        return None
    ranked = counts.most_common(2)
    total = sum(counts.values())
    runner_up = ranked[1][1] / total if len(ranked) > 1 else 0.0
    return Ownership(
        rgb=ranked[0][0],
        method="id-majority",
        sample_count=total,
        confidence=ranked[0][1] / total,
        runner_up_share=runner_up,
    )


def facet_neighbors(facets: list[Facet]) -> list[set[int]]:
    edges: dict[tuple[tuple[float, float], tuple[float, float]], list[int]] = defaultdict(list)
    vertices: dict[tuple[float, float], list[int]] = defaultdict(list)
    for facet in facets:
        a, b, c = facet.vertex_keys
        for edge in ((a, b), (b, c), (c, a)):
            edges[tuple(sorted(edge))].append(facet.index)
        for vertex in facet.vertex_keys:
            vertices[vertex].append(facet.index)
    neighbors = [set() for _ in facets]
    for group in edges.values():
        for facet_index in group:
            neighbors[facet_index].update(other for other in group if other != facet_index)
    for group in vertices.values():
        for facet_index in group:
            neighbors[facet_index].update(other for other in group if other != facet_index)
    return neighbors


def propagate_ownership(
    facets: list[Facet], ownership: list[Ownership | None]
) -> tuple[list[Ownership | None], int]:
    neighbors = facet_neighbors(facets)
    propagated = 0
    while True:
        assignments: list[tuple[int, Ownership]] = []
        for facet in facets:
            if ownership[facet.index] is not None:
                continue
            votes = Counter(
                ownership[neighbor].rgb
                for neighbor in neighbors[facet.index]
                if ownership[neighbor] is not None
            )
            if not votes:
                continue
            ranked = votes.most_common(2)
            total = sum(votes.values())
            assignments.append(
                (
                    facet.index,
                    Ownership(
                        rgb=ranked[0][0],
                        method="id-neighbor",
                        sample_count=total,
                        confidence=ranked[0][1] / total,
                        runner_up_share=ranked[1][1] / total if len(ranked) > 1 else 0.0,
                    ),
                )
            )
        if not assignments:
            break
        for facet_index, owner in assignments:
            ownership[facet_index] = owner
        propagated += len(assignments)
    return ownership, propagated


def render_atlas(facets: list[Facet], ownership: list[Ownership | None]) -> Image.Image:
    width, height = OUTPUT_SIZE
    output = Image.new("RGBA", OUTPUT_SIZE, (*BACKGROUND_RGB, 255))
    draw = ImageDraw.Draw(output)
    # Large facets first keeps small coastal/island facets from being hidden by
    # shared-edge raster rounding. The facet index is a deterministic tiebreaker.
    for facet in sorted(facets, key=lambda item: (-item.area, item.index)):
        owner = ownership[facet.index]
        if owner is None:
            continue
        points = [(u * width, v * height) for u, v in facet.uv]
        for x_shift in (-width, 0, width):
            shifted = [(x + x_shift, y) for x, y in points]
            if max(x for x, _ in shifted) < 0 or min(x for x, _ in shifted) >= width:
                continue
            draw.polygon(shifted, fill=(*owner.rgb, 255))
    return output


def validate_palette(image: Image.Image, valid_colors: set[tuple[int, int, int]]) -> int:
    colors = image.convert("RGB").getcolors(maxcolors=image.width * image.height)
    if colors is None:
        raise RuntimeError("Unable to enumerate output colors")
    unknown = sorted(color for _, color in colors if color not in valid_colors)
    if unknown:
        raise RuntimeError(f"Visual atlas contains unknown RGB identities: {unknown[:12]}")
    return len(colors)


def images_equal(left: Image.Image, right: Image.Image) -> bool:
    return left.mode == right.mode and left.size == right.size and left.tobytes() == right.tobytes()


def seam_report(image: Image.Image, colors_by_iso3: dict[str, tuple[int, int, int]]) -> dict[str, object]:
    pixels = image.convert("RGB")
    width, height = image.size
    edge_width = 16
    report: dict[str, object] = {"edge_width_pixels": edge_width}
    for side, bounds in (
        ("left", (0, 0, edge_width, height)),
        ("right", (width - edge_width, 0, width, height)),
    ):
        edge_crop = pixels.crop(bounds)
        edge_data = (
            edge_crop.get_flattened_data()
            if hasattr(edge_crop, "get_flattened_data")
            else edge_crop.getdata()
        )
        edge_colors = Counter(edge_data)
        report[side] = {
            iso3: edge_colors[color]
            for iso3, color in {key: colors_by_iso3[key] for key in ("RUS", "USA")}.items()
        }
    if report["left"]["RUS"] == 0 or report["right"]["RUS"] == 0:
        raise RuntimeError("Russia is not continuous across both visual-atlas seam edges")
    if report["left"]["USA"] != 0 or report["right"]["USA"] != 0:
        raise RuntimeError("USA pixels wrapped onto a visual-atlas seam edge")
    return report


def main() -> None:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    texture_dir = repo_root / "public" / "assets" / "globe" / "textures"
    model_path = repo_root / "public" / "assets" / "globe" / "models" / "land.glb"
    id_path = texture_dir / "countryIdTexture.png"
    lookup_path = repo_root / "public" / "assets" / "globe" / "data" / "countryLookup.json"
    output_path = texture_dir / "visualCountryAtlas_v5.png"
    preview_path = texture_dir / "visualCountryAtlas_v5_preview_4096.png"

    source_hashes = validate_source_hashes((model_path, id_path, lookup_path), args.allow_source_drift)
    id_image = Image.open(id_path).convert("RGB")
    if id_image.size != SOURCE_SIZE:
        raise RuntimeError(f"{id_path.name} is {id_image.size}, expected {SOURCE_SIZE}")
    lookup = json.loads(lookup_path.read_text(encoding="utf-8"))
    colors_by_iso3 = {entry["iso3"]: tuple(entry["rgb"]) for entry in lookup.values()}
    valid_colors = set(colors_by_iso3.values()) | {BACKGROUND_RGB}

    positions, indices = load_land_geometry(model_path)
    facets = build_facets(positions, indices)
    id_pixels = id_image.load()
    ownership = [sample_facet(facet, id_pixels, valid_colors) for facet in facets]
    direct_count = sum(owner is not None for owner in ownership)
    ownership, propagated_count = propagate_ownership(facets, ownership)
    unassigned = sum(owner is None for owner in ownership)
    unassigned_areas = [
        facet.area * OUTPUT_SIZE[0] * OUTPUT_SIZE[1]
        for facet, owner in zip(facets, ownership)
        if owner is None
    ]
    atlas = render_atlas(facets, ownership)
    preview = atlas.resize(PREVIEW_SIZE, Image.Resampling.NEAREST)
    palette_count = validate_palette(atlas, valid_colors)
    alpha_values = sorted(value for _, value in atlas.getchannel("A").getcolors())
    if alpha_values != [255]:
        raise RuntimeError(f"Unexpected output alpha values: {alpha_values}")

    if args.check:
        existing_atlas = Image.open(output_path)
        existing_atlas.load()
        existing_preview = Image.open(preview_path)
        existing_preview.load()
        if not images_equal(existing_atlas, atlas):
            raise RuntimeError(f"{output_path.name} does not match the deterministic rebuild")
        if not images_equal(existing_preview, preview):
            raise RuntimeError(f"{preview_path.name} does not match the deterministic rebuild")
    else:
        atlas.save(output_path, format="PNG", compress_level=9, optimize=False)
        preview.save(preview_path, format="PNG", compress_level=9, optimize=False)

    iso3_by_color = {color: iso3 for iso3, color in colors_by_iso3.items()}
    owner_counts = Counter(
        iso3_by_color.get(owner.rgb, "UNKNOWN") for owner in ownership if owner is not None
    )
    ambiguous = [
        facet.index
        for facet, owner in zip(facets, ownership)
        if owner is not None and owner.method == "id-majority" and owner.runner_up_share >= 0.45
    ]
    report = {
        "mode": "check" if args.check else "write",
        "source_sha256": source_hashes,
        "geometry": {
            "positions": len(positions),
            "triangles": len(facets),
            "direct_id_majority": direct_count,
            "id_neighbor_propagated": propagated_count,
            "unassigned": unassigned,
            "unassigned_projected_area_pixels": round(sum(unassigned_areas), 3),
            "largest_unassigned_projected_area_pixels": round(max(unassigned_areas, default=0), 3),
            "ambiguous_direct_facets": len(ambiguous),
            "ambiguous_facet_indices": ambiguous,
            "facets_by_country": dict(sorted(owner_counts.items())),
        },
        "outputs": {
            output_path.name: {
                "size": list(atlas.size),
                "mode": atlas.mode,
                "sha256": sha256(output_path),
            },
            preview_path.name: {
                "size": list(preview.size),
                "mode": preview.mode,
                "sha256": sha256(preview_path),
            },
        },
        "palette": {
            "rgb_colors": palette_count,
            "unknown_rgb_colors": 0,
            "alpha_values": alpha_values,
        },
        "seam": seam_report(atlas, colors_by_iso3),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
