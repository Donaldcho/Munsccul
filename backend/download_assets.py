import ssl
import os
import httpx
import sys
import certifi

# Define URLs for assets
assets = {
    "swagger-ui-bundle.js": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
    "swagger-ui.css": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
    "swagger-ui-standalone-preset.js": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js",
    "redoc.standalone.js": "https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
}

# Target directory
static_dir = os.path.join(os.path.dirname(__file__), "app", "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

print(f"Downloading assets to {static_dir}...")

# Use certifi's CA bundle
ssl_context = ssl.create_default_context(cafile=certifi.where())

with httpx.Client(verify=ssl_context, follow_redirects=True, timeout=30.0) as client:
    for filename, url in assets.items():
        filepath = os.path.join(static_dir, filename)
        print(f"Downloading {filename}...")
        try:
            response = client.get(url)
            response.raise_for_status()
            with open(filepath, "wb") as f:
                f.write(response.content)
            print(f"Successfully downloaded {filename}")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
            sys.exit(1)

print("Asset download complete.")
