import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export class GlobeAssetError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "GlobeAssetError";
    this.code = code;
    this.cause = cause;
  }
}

export class GlobeAssetLoader {
  constructor(config, { onError = null } = {}) {
    this.config = config;
    this.onError = onError;
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  async load() {
    try {
      const assets = this.config.assets;
      const [oceanGltf, landGltf, countryLookup, countryIdTexture, visualAtlasTexture] =
        await Promise.all([
          this.#loadGltf(assets.oceanModel, "oceanModel"),
          this.#loadGltf(assets.landModel, "landModel"),
          this.#loadLookup(assets.countryLookup),
          this.#loadTexture(assets.countryIdTexture),
          this.#loadTexture(assets.visualCountryAtlas)
        ]);
      const idSampler = this.#createIdSampler(countryIdTexture.image, assets.countryIdTexture);

      const oceanMesh = this.#firstMesh(oceanGltf.scene, "oceanModel");
      const landMesh = this.#firstMesh(landGltf.scene, "landModel");
      this.#validateLookup(countryLookup);
      this.#prepareAtlasTexture(countryIdTexture);
      this.#prepareAtlasTexture(visualAtlasTexture);

      return {
        oceanGltf,
        landGltf,
        oceanMesh,
        landMesh,
        idSampler,
        countryLookup,
        countryByRgb: new Map(Object.values(countryLookup).map((country) => [country.rgb.join(","), country])),
        countryIdTexture,
        visualAtlasTexture
      };
    } catch (error) {
      const normalized = error instanceof GlobeAssetError
        ? error
        : new GlobeAssetError("asset-load-failed", "Failed to load SwingSphere globe assets.", error);
      this.onError?.(normalized);
      throw normalized;
    }
  }

  async #loadGltf(url, label) {
    try {
      return await this.gltfLoader.loadAsync(url);
    } catch (error) {
      throw new GlobeAssetError(label, `Unable to load ${label}: ${url}`, error);
    }
  }

  async #loadTexture(url) {
    try {
      return await this.textureLoader.loadAsync(url);
    } catch (error) {
      throw new GlobeAssetError("texture", `Unable to load texture: ${url}`, error);
    }
  }

  async #loadLookup(url) {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new GlobeAssetError("country-lookup-network", `Unable to fetch country lookup: ${url}`, error);
    }
    if (!response.ok) {
      throw new GlobeAssetError("country-lookup-http", `Country lookup returned HTTP ${response.status}: ${url}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new GlobeAssetError("country-lookup-json", `Country lookup is not valid JSON: ${url}`, error);
    }
  }

  #createIdSampler(image, url) {
    if (!image) {
      throw new GlobeAssetError("country-id-image", `Country ID texture did not expose a decoded image: ${url}`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth ?? image.width;
    canvas.height = image.naturalHeight ?? image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new GlobeAssetError("country-id-canvas", "Unable to create CPU sampler canvas.");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
    };
  }

  #prepareAtlasTexture(texture) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
  }

  #firstMesh(root, label) {
    let result = null;
    root.traverse((child) => {
      if (!result && child.isMesh) result = child;
    });
    if (!result) throw new GlobeAssetError(label, `${label} did not contain a mesh.`);
    if (!result.geometry) throw new GlobeAssetError(label, `${label} mesh is missing geometry.`);
    result.geometry.computeBoundingSphere();
    return result;
  }

  #validateLookup(countryLookup) {
    if (!countryLookup || typeof countryLookup !== "object") {
      throw new GlobeAssetError("country-lookup-schema", "Country lookup must be an object.");
    }
    for (const country of Object.values(countryLookup)) {
      if (!country || !Array.isArray(country.rgb) || country.rgb.length !== 3) {
        throw new GlobeAssetError("country-lookup-schema", "Country lookup entries must include rgb arrays.");
      }
    }
  }
}
