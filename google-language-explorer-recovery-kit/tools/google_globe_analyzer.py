from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from scrapling.fetchers import Fetcher


TARGET_URL = "https://sites.research.google/languages/language-explorer/"
OUTPUT_DIR = Path("analysis_output")
MAX_JS_DOWNLOADS = 20
MAX_OTHER_DOWNLOADS = 40
REQUEST_TIMEOUT = 30

# What to look for in HTML / JS
KEYWORDS = [
    "three",
    "webgl",
    "shader",
    "fragment",
    "vertex",
    "gl_Position",
    "gltf",
    "glb",
    "draco",
    "ktx2",
    "basis",
    "geojson",
    "topojson",
    "requestAnimationFrame",
    "OrbitControls",
    "PerspectiveCamera",
    "Scene",
    "Mesh",
]

# Asset extensions worth inventorying
INTERESTING_EXTENSIONS = {
    ".js": "scripts",
    ".mjs": "scripts",
    ".css": "styles",
    ".json": "data",
    ".geojson": "data",
    ".topojson": "data",
    ".glb": "models",
    ".gltf": "models",
    ".bin": "models",
    ".draco": "models",
    ".ktx2": "textures",
    ".basis": "textures",
    ".png": "images",
    ".jpg": "images",
    ".jpeg": "images",
    ".webp": "images",
    ".svg": "images",
    ".gif": "images",
    ".woff": "fonts",
    ".woff2": "fonts",
    ".ttf": "fonts",
    ".otf": "fonts",
    ".mp3": "audio",
    ".wav": "audio",
    ".ogg": "audio",
    ".mp4": "video",
    ".webm": "video",
}

URL_REGEX = re.compile(
    r"""(?:
        ["'`]
        (
            (?:https?:)?//[^"'`\s)]+ |
            /[^"'`\s)]+ |
            \./[^"'`\s)]+ |
            \.\./[^"'`\s)]+ |
            [A-Za-z0-9_\-/]+(?:/[A-Za-z0-9_\-.]+)+
        )
        ["'`]
    )""",
    re.VERBOSE,
)

ASSET_HINT_REGEX = re.compile(
    r"""[^"'`\s)]+(?:\.js|\.mjs|\.css|\.json|\.geojson|\.topojson|\.glb|\.gltf|\.bin|\.draco|\.ktx2|\.basis|\.png|\.jpg|\.jpeg|\.webp|\.svg|\.gif|\.woff2?|\.ttf|\.otf|\.mp3|\.wav|\.ogg|\.mp4|\.webm)(?:\?[^"'`\s)]*)?""",
    re.IGNORECASE,
)


def ensure_dirs(base: Path) -> None:
    base.mkdir(parents=True, exist_ok=True)
    for folder in set(INTERESTING_EXTENSIONS.values()):
        (base / folder).mkdir(parents=True, exist_ok=True)
    (base / "reports").mkdir(parents=True, exist_ok=True)
    (base / "raw").mkdir(parents=True, exist_ok=True)


def safe_filename_from_url(url: str) -> str:
    parsed = urlparse(url)
    name = Path(parsed.path).name or "index"
    # strip query noise from name if needed
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name[:180]


def normalize_url(base_url: str, value: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    if value.startswith("data:") or value.startswith("javascript:") or value.startswith("#"):
        return None
    if value.startswith("//"):
        return "https:" + value
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return urljoin(base_url, value)


def ext_for_url(url: str) -> str:
    path = urlparse(url).path.lower()
    return Path(path).suffix.lower()


def bucket_for_url(url: str) -> str | None:
    return INTERESTING_EXTENSIONS.get(ext_for_url(url))


def download_text(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.google.com/",
        },
    )
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


def download_binary(url: str) -> bytes:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": TARGET_URL,
        },
    )
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.read()


def write_download(base: Path, bucket: str, url: str, data: bytes) -> Path:
    filename = safe_filename_from_url(url)
    out_path = base / bucket / filename
    # avoid collisions
    if out_path.exists():
        stem = out_path.stem
        suffix = out_path.suffix
        counter = 2
        while True:
            candidate = out_path.with_name(f"{stem}_{counter}{suffix}")
            if not candidate.exists():
                out_path = candidate
                break
            counter += 1
    out_path.write_bytes(data)
    return out_path


def extract_urls_from_response(page, base_url: str) -> set[str]:
    found: set[str] = set()

    selectors = [
        "script::attr(src)",
        "link::attr(href)",
        "img::attr(src)",
        "source::attr(src)",
        "video::attr(src)",
        "audio::attr(src)",
        "[src]::attr(src)",
        "[href]::attr(href)",
    ]

    for selector in selectors:
        try:
            values = page.css(selector).getall()
        except Exception:
            values = []
        for value in values:
            normalized = normalize_url(base_url, value)
            if normalized:
                found.add(normalized)

    html = str(page)

    for regex in (URL_REGEX, ASSET_HINT_REGEX):
        for match in regex.findall(html):
            value = match if isinstance(match, str) else match[0]
            normalized = normalize_url(base_url, value)
            if normalized:
                found.add(normalized)

    return found


def keyword_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for keyword in KEYWORDS:
        counts[keyword] = len(re.findall(re.escape(keyword), text, flags=re.IGNORECASE))
    return counts


def discover_from_js(base_url: str, js_url: str) -> tuple[dict[str, int], set[str], str]:
    text = download_text(js_url)
    counts = keyword_counts(text)
    found: set[str] = set()

    for regex in (URL_REGEX, ASSET_HINT_REGEX):
        for match in regex.findall(text):
            value = match if isinstance(match, str) else match[0]
            normalized = normalize_url(js_url, value)
            if normalized:
                found.add(normalized)

    return counts, found, text


def main() -> int:
    ensure_dirs(OUTPUT_DIR)

    print(f"\nFetching page: {TARGET_URL}\n")
    page = Fetcher.get(TARGET_URL)

    page_title = page.css("title::text").get() or "(no title found)"
    raw_html = str(page)
    html_counts = keyword_counts(raw_html)

    discovered_urls = extract_urls_from_response(page, TARGET_URL)
    interesting_urls = sorted(
        {u for u in discovered_urls if bucket_for_url(u) is not None}
    )
    js_urls = [u for u in interesting_urls if bucket_for_url(u) == "scripts"]

    print(f"Status: {page.status}")
    print(f"Title: {page_title}")
    print(f"Interesting URLs found in initial HTML: {len(interesting_urls)}")
    print(f"JS bundles found: {len(js_urls)}")

    # Save initial HTML snapshot
    (OUTPUT_DIR / "raw" / "page_snapshot.html").write_text(raw_html, encoding="utf-8")

    js_analysis = []
    discovered_from_js: set[str] = set()

    print("\nScanning JS bundles...")
    for i, js_url in enumerate(js_urls[:MAX_JS_DOWNLOADS], start=1):
        print(f"  [{i}/{min(len(js_urls), MAX_JS_DOWNLOADS)}] {js_url}")
        try:
            counts, extra_urls, text = discover_from_js(TARGET_URL, js_url)
            discovered_from_js.update(extra_urls)

            out_path = write_download(
                OUTPUT_DIR,
                "scripts",
                js_url,
                text.encode("utf-8", errors="replace"),
            )

            js_analysis.append(
                {
                    "url": js_url,
                    "saved_to": str(out_path),
                    "keyword_counts": counts,
                    "discovered_urls": sorted(
                        u for u in extra_urls if bucket_for_url(u) is not None
                    )[:300],
                }
            )
            time.sleep(0.2)
        except Exception as e:
            js_analysis.append(
                {
                    "url": js_url,
                    "error": str(e),
                }
            )

    all_interesting = sorted(
        set(interesting_urls)
        | {u for u in discovered_from_js if bucket_for_url(u) is not None}
    )

    # Download non-JS assets too
    downloads = []
    other_urls = [u for u in all_interesting if bucket_for_url(u) != "scripts"]

    print("\nDownloading non-JS assets...")
    for i, asset_url in enumerate(other_urls[:MAX_OTHER_DOWNLOADS], start=1):
        bucket = bucket_for_url(asset_url)
        if not bucket:
            continue
        print(f"  [{i}/{min(len(other_urls), MAX_OTHER_DOWNLOADS)}] {asset_url}")
        try:
            data = download_binary(asset_url)
            out_path = write_download(OUTPUT_DIR, bucket, asset_url, data)
            downloads.append(
                {
                    "url": asset_url,
                    "bucket": bucket,
                    "saved_to": str(out_path),
                    "size_bytes": len(data),
                }
            )
            time.sleep(0.2)
        except Exception as e:
            downloads.append(
                {
                    "url": asset_url,
                    "bucket": bucket,
                    "error": str(e),
                }
            )

    summary = {
        "target_url": TARGET_URL,
        "status": page.status,
        "title": page_title,
        "html_keyword_counts": html_counts,
        "initial_interesting_urls": interesting_urls,
        "js_bundle_count": len(js_urls),
        "js_analysis": js_analysis,
        "asset_downloads": downloads,
        "totals": {
            "interesting_urls_total": len(all_interesting),
            "downloaded_assets_total": len([d for d in downloads if "saved_to" in d]),
        },
    }

    report_json = OUTPUT_DIR / "reports" / "report.json"
    report_md = OUTPUT_DIR / "reports" / "report.md"

    report_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    lines = [
        f"# Google Globe Analyzer Report",
        "",
        f"- Target: {TARGET_URL}",
        f"- Status: {page.status}",
        f"- Title: {page_title}",
        "",
        "## HTML keyword counts",
        "",
    ]
    for k, v in html_counts.items():
        lines.append(f"- {k}: {v}")

    lines += [
        "",
        "## Initial interesting URLs",
        "",
    ]
    for url in interesting_urls[:200]:
        lines.append(f"- {url}")

    lines += [
        "",
        "## JS bundle analysis",
        "",
    ]
    for item in js_analysis:
        lines.append(f"### {item['url']}")
        if "error" in item:
            lines.append(f"- Error: {item['error']}")
        else:
            lines.append(f"- Saved to: {item['saved_to']}")
            lines.append("- Keyword counts:")
            for k, v in item["keyword_counts"].items():
                if v:
                    lines.append(f"  - {k}: {v}")
            discovered = item.get("discovered_urls", [])
            if discovered:
                lines.append("- Discovered URLs from bundle:")
                for u in discovered[:50]:
                    lines.append(f"  - {u}")
        lines.append("")

    lines += [
        "## Downloaded non-JS assets",
        "",
    ]
    for item in downloads:
        if "saved_to" in item:
            lines.append(
                f"- [{item['bucket']}] {item['url']} -> {item['saved_to']} ({item['size_bytes']} bytes)"
            )
        else:
            lines.append(f"- [{item['bucket']}] {item['url']} -> ERROR: {item['error']}")

    report_md.write_text("\n".join(lines), encoding="utf-8")

    print("\nDone.")
    print(f"JSON report: {report_json}")
    print(f"Markdown report: {report_md}")
    print(f"Output folder: {OUTPUT_DIR.resolve()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())