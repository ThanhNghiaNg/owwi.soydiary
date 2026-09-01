const GOOGLE_DRIVE_HOSTS = new Set(["drive.google.com", "drive.usercontent.google.com"]);
const GOOGLE_DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const GOOGLE_DRIVE_ASSET_PREFIX = "/api/integrations/google-drive/assets/";

export function isGoogleDriveFileId(value: string) {
  return GOOGLE_DRIVE_FILE_ID_PATTERN.test(value);
}

export function googleDriveAssetPath(fileId: string) {
  if (!isGoogleDriveFileId(fileId)) throw new Error("INVALID_GOOGLE_DRIVE_FILE_ID");
  return `${GOOGLE_DRIVE_ASSET_PREFIX}${encodeURIComponent(fileId)}`;
}

export function isGoogleDriveAssetUrl(value: string) {
  const matchesPath = (pathname: string) => {
    if (!pathname.startsWith(GOOGLE_DRIVE_ASSET_PREFIX)) return false;
    const fileId = pathname.slice(GOOGLE_DRIVE_ASSET_PREFIX.length);
    return isGoogleDriveFileId(fileId);
  };

  if (value.startsWith("/")) return matchesPath(value);

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      matchesPath(url.pathname)
    );
  } catch {
    return false;
  }
}

export function extractGoogleDriveFileId(value: string) {
  try {
    const url = new URL(value);
    if (!GOOGLE_DRIVE_HOSTS.has(url.hostname.toLowerCase())) return undefined;

    const queryId = url.searchParams.get("id");
    if (queryId && isGoogleDriveFileId(queryId)) return queryId;

    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    const pathId = pathMatch?.[1];
    return pathId && isGoogleDriveFileId(pathId) ? pathId : undefined;
  } catch {
    return undefined;
  }
}

export function resolveGoogleDriveImageUrl(value?: string) {
  if (!value) return value;
  if (isGoogleDriveAssetUrl(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return value;
    }
  }
  const fileId = extractGoogleDriveFileId(value);
  return fileId ? googleDriveAssetPath(fileId) : value;
}
