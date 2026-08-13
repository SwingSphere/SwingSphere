from scrapling.fetchers import Fetcher
import re

url = "https://sites.research.google/languages/language-explorer/"

page = Fetcher.get(url)

print("\n--- STATUS ---")
print(page.status)

print("\n--- TITLE ---")
print(page.css("title::text").get())

print("\n--- SCRIPT FILES ---")
scripts = page.css("script::attr(src)").getall()

for s in scripts:
    print(s)

html = str(page)

print("\n--- HINT COUNTS ---")
for pattern in ["three", "webgl", "shader", ".json", ".geojson", "api/"]:
    count = len(re.findall(pattern, html, re.I))
    print(f"{pattern}: {count}")