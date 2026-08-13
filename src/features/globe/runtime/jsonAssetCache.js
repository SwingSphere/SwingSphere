const jsonAssetPromises = new Map();

export function loadJsonAsset(url) {
  if (!url) return Promise.resolve(null);
  const key = String(url);
  const cached = jsonAssetPromises.get(key);
  if (cached) return cached;

  const promise = fetch(key)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load JSON asset (${response.status}): ${key}`);
      return response.json();
    })
    .catch((error) => {
      // Failed requests should be retryable after a transient network or cache issue.
      jsonAssetPromises.delete(key);
      throw error;
    });

  jsonAssetPromises.set(key, promise);
  return promise;
}
