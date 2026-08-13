#!/usr/bin/env python3
"""Build the restrained 8K Visual Country Atlas v6 from v4.

v6 deliberately preserves v4's shapes and color assignments. It uses the
exact-color Scale2x algorithm to refine diagonal raster edges without blending
country identities, then applies only bounded pairwise repairs guided by the
unchanged country ID atlas.

Requires Pillow and NumPy. Run from anywhere with:

    python scripts/globe/build-visual-country-atlas-v6.py
    python scripts/globe/build-visual-country-atlas-v6.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image


SOURCE_SIZE = (4096, 2048)
OUTPUT_SIZE = (8192, 4096)
PREVIEW_SIZE = SOURCE_SIZE
BACKGROUND_RGB = (0, 0, 0)
MAX_CHANGED_FRACTION = 0.01
EXPECTED_SOURCE_SHA256 = {
    "visualCountryAtlas_v4.png": "910b186b904af4324962e15d9f6a31f1ad80165987dea022bcce5de98335a05e",
    "countryIdTexture.png": "efb41c81ab9d72419ba0b54968f1bf9becff4be1325b42e8605978fdceb32300",
    "countryLookup.json": "d1a037c3bd496b96bb49737fc649a922e8180627d4b315e220d31b20c743175e",
}


@dataclass(frozen=True)
class RepairRegion:
    name: str
    bounds: tuple[tuple[float, float, float, float], ...]
    transitions: tuple[tuple[str, str], ...]


# Bounds are longitude_min, longitude_max, latitude_min, latitude_max.
# The seam is audited at both texture edges as one logical repair region.
REPAIR_REGIONS = (
    RepairRegion(
        "alaska_russia_seam",
        ((-180, -165, 50, 72), (165, 180, 50, 72)),
        (("USA", "RUS"), ("RUS", "USA")),
    ),
    RepairRegion(
        "mainland_us_canada",
        ((-125, -60, 40, 58),),
        (("USA", "CAN"), ("CAN", "USA")),
    ),
    RepairRegion(
        "australia_png_indonesia",
        ((118, 165, -48, 8),),
        (
            ("AUS", "PNG"),
            ("AUS", "IDN"),
            ("PNG", "AUS"),
            ("PNG", "IDN"),
            ("IDN", "AUS"),
            ("IDN", "PNG"),
        ),
    ),
    RepairRegion(
        "malaysia_singapore_indonesia",
        ((95, 125, -12, 15),),
        (("MYS", "IDN"),),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify existing v6 files against a deterministic rebuild without rewriting them",
    )
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="allow intentional source changes after manually auditing them",
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


def validate_source_image(path: Path, mode: str) -> Image.Image:
    image = Image.open(path)
    image.load()
    if image.size != SOURCE_SIZE:
        raise RuntimeError(f"{path.name} is {image.size}, expected {SOURCE_SIZE}")
    if image.mode != mode:
        raise RuntimeError(f"{path.name} is {image.mode}, expected {mode}")
    return image


def scale2x_exact(source: Image.Image) -> Image.Image:
    """Double an RGBA image with Scale2x while preserving exact colors."""
    pixels = np.asarray(source, dtype=np.uint8)
    north = np.concatenate((pixels[:1], pixels[:-1]), axis=0)
    south = np.concatenate((pixels[1:], pixels[-1:]), axis=0)
    west = np.concatenate((pixels[:, :1], pixels[:, :-1]), axis=1)
    east = np.concatenate((pixels[:, 1:], pixels[:, -1:]), axis=1)

    north_eq_west = np.all(north == west, axis=2)
    north_eq_east = np.all(north == east, axis=2)
    south_eq_west = np.all(south == west, axis=2)
    south_eq_east = np.all(south == east, axis=2)
    west_ne_south = np.any(west != south, axis=2)
    north_ne_east = np.any(north != east, axis=2)

    top_left = np.where((north_eq_west & west_ne_south & north_ne_east)[..., None], west, pixels)
    top_right = np.where((north_eq_east & np.any(north != west, axis=2) & np.any(east != south, axis=2))[..., None], east, pixels)
    bottom_left = np.where((south_eq_west & np.any(south != east, axis=2) & np.any(west != north, axis=2))[..., None], west, pixels)
    bottom_right = np.where((south_eq_east & np.any(west != south, axis=2) & np.any(north != east, axis=2))[..., None], east, pixels)

    output = np.empty((pixels.shape[0] * 2, pixels.shape[1] * 2, pixels.shape[2]), dtype=np.uint8)
    output[0::2, 0::2] = top_left
    output[0::2, 1::2] = top_right
    output[1::2, 0::2] = bottom_left
    output[1::2, 1::2] = bottom_right
    return Image.fromarray(output, mode="RGBA")


def atlas_bounds(bounds: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    longitude_min, longitude_max, latitude_min, latitude_max = bounds
    width, height = OUTPUT_SIZE
    x0 = max(0, int((longitude_min + 180) / 360 * width))
    x1 = min(width, int((longitude_max + 180) / 360 * width + 0.999999))
    y0 = max(0, int((90 - latitude_max) / 180 * height))
    y1 = min(height, int((90 - latitude_min) / 180 * height + 0.999999))
    return x0, y0, x1, y1


def apply_repairs(
    atlas: Image.Image,
    id_atlas: Image.Image,
    colors_by_iso3: dict[str, tuple[int, int, int]],
) -> tuple[Image.Image, list[dict[str, object]]]:
    output = np.array(atlas, dtype=np.uint8, copy=True)
    id_pixels = np.asarray(id_atlas, dtype=np.uint8)
    reports: list[dict[str, object]] = []

    for region in REPAIR_REGIONS:
        transitions: Counter[tuple[str, str]] = Counter()
        atlas_boxes: list[list[int]] = []
        for geographic_bounds in region.bounds:
            x0, y0, x1, y1 = atlas_bounds(geographic_bounds)
            atlas_boxes.append([x0, y0, x1, y1])
            output_crop = output[y0:y1, x0:x1, :3]
            id_crop = id_pixels[y0:y1, x0:x1, :3]
            for source_iso3, target_iso3 in region.transitions:
                source_rgb = np.array(colors_by_iso3[source_iso3], dtype=np.uint8)
                target_rgb = np.array(colors_by_iso3[target_iso3], dtype=np.uint8)
                mask = np.all(output_crop == source_rgb, axis=2) & np.all(id_crop == target_rgb, axis=2)
                changed = int(np.count_nonzero(mask))
                if not changed:
                    continue
                output_crop[mask] = target_rgb
                transitions[(source_iso3, target_iso3)] += changed

        reports.append(
            {
                "name": region.name,
                "geographic_bounds": [list(bounds) for bounds in region.bounds],
                "atlas_bounds_8k": atlas_boxes,
                "changed_pixels": sum(transitions.values()),
                "transitions": [
                    {"from": source, "to": target, "pixels": count}
                    for (source, target), count in sorted(transitions.items())
                ],
            }
        )

    return Image.fromarray(output, mode="RGBA"), reports


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
    pixels = np.asarray(image.convert("RGB"), dtype=np.uint8)
    edge_width = 16
    report: dict[str, object] = {"edge_width_pixels": edge_width}
    for side, edge in (("left", pixels[:, :edge_width]), ("right", pixels[:, -edge_width:])):
        report[side] = {
            iso3: int(np.count_nonzero(np.all(edge == np.array(colors_by_iso3[iso3]), axis=2)))
            for iso3 in ("RUS", "USA")
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
    lookup_path = repo_root / "public" / "assets" / "globe" / "data" / "countryLookup.json"
    visual_v4_path = texture_dir / "visualCountryAtlas_v4.png"
    id_path = texture_dir / "countryIdTexture.png"
    output_path = texture_dir / "visualCountryAtlas_v6.png"
    preview_path = texture_dir / "visualCountryAtlas_v6_preview_4096.png"

    source_hashes = validate_source_hashes(
        (visual_v4_path, id_path, lookup_path),
        args.allow_source_drift,
    )
    visual_v4 = validate_source_image(visual_v4_path, "RGBA")
    id_source = validate_source_image(id_path, "RGB")
    lookup = json.loads(lookup_path.read_text(encoding="utf-8"))
    colors_by_iso3 = {entry["iso3"]: tuple(entry["rgb"]) for entry in lookup.values()}
    valid_colors = set(colors_by_iso3.values()) | {BACKGROUND_RGB}

    nearest_baseline = visual_v4.resize(OUTPUT_SIZE, Image.Resampling.NEAREST)
    edge_cleaned = scale2x_exact(visual_v4)
    id_8k = id_source.resize(OUTPUT_SIZE, Image.Resampling.NEAREST)
    atlas, repair_reports = apply_repairs(edge_cleaned, id_8k, colors_by_iso3)
    preview = atlas.resize(PREVIEW_SIZE, Image.Resampling.NEAREST)

    baseline_pixels = np.asarray(nearest_baseline, dtype=np.uint8)
    edge_pixels = np.asarray(edge_cleaned, dtype=np.uint8)
    output_pixels = np.asarray(atlas, dtype=np.uint8)
    edge_changed_mask = np.any(edge_pixels != baseline_pixels, axis=2)
    total_changed_mask = np.any(output_pixels != baseline_pixels, axis=2)
    edge_changed_pixels = int(np.count_nonzero(edge_changed_mask))
    total_changed_pixels = int(np.count_nonzero(total_changed_mask))
    changed_fraction = total_changed_pixels / (OUTPUT_SIZE[0] * OUTPUT_SIZE[1])
    if changed_fraction > MAX_CHANGED_FRACTION:
        raise RuntimeError(
            f"v6 changed {changed_fraction:.4%} of the nearest-neighbor v4 baseline; "
            f"limit is {MAX_CHANGED_FRACTION:.2%}"
        )

    palette_count = validate_palette(atlas, valid_colors)
    preview_palette_count = validate_palette(preview, valid_colors)
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

    report = {
        "mode": "check" if args.check else "write",
        "method": "exact-color Scale2x from v4, followed by bounded ID-guided pairwise repairs",
        "source_sha256": source_hashes,
        "comparison_to_8k_nearest_neighbor_v4": {
            "edge_cleanup_changed_pixels": edge_changed_pixels,
            "total_changed_pixels": total_changed_pixels,
            "unchanged_pixels": OUTPUT_SIZE[0] * OUTPUT_SIZE[1] - total_changed_pixels,
            "changed_fraction": changed_fraction,
            "unchanged_fraction": 1.0 - changed_fraction,
        },
        "repairs": repair_reports,
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
            "v6_rgb_colors": palette_count,
            "preview_rgb_colors": preview_palette_count,
            "unknown_rgb_colors": 0,
            "alpha_values": alpha_values,
        },
        "seam": seam_report(atlas, colors_by_iso3),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
