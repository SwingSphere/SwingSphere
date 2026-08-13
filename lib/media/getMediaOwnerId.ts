const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hash32 = (value: string, seed: number) => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getMediaOwnerId = (ownerType: string, ownerId: string) => {
  if (UUID_PATTERN.test(ownerId)) return ownerId;
  const source = `${ownerType}:${ownerId}`;
  const parts = [
    hash32(source, 2166136261),
    hash32(source, 2246822519),
    hash32(source, 3266489917),
    hash32(source, 668265263),
  ].map((part) => part.toString(16).padStart(8, '0'));
  const hex = parts.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
