const GOOGLE_DRIVE_HOSTS = new Set(["drive.google.com", "drive.usercontent.google.com"]);
const GOOGLE_DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const CONNECTION_ID_PATTERN = /^[a-f0-9]{24}$/i;
const GOOGLE_DRIVE_ASSET_PREFIX = "/api/integrations/google-drive/assets/";

export function isGoogleDriveFileId(value: string) {
  return GOOGLE_DRIVE_FILE_ID_PATTERN.test(value);
}

export function googleDriveAssetPath(connectionId: string, fileId: string) {
  if (!CONNECTION_ID_PATTERN.test(connectionId)) throw new Error("INVALID_CONNECTION_ID");
  if (!isGoogleDriveFileId(fileId)) throw new Error("INVALID_GOOGLE_DRIVE_FILE_ID");
  return `${GOOGLE_DRIVE_ASSET_PREFIX}${encodeURIComponent(connectionId)}/${encodeURIComponent(fileId)}`;
}

export function isGoogleDriveAssetUrl(value: string) {
  const matchesPath = (pathname: string) => {
    if (!pathname.startsWith(GOOGLE_DRIVE_ASSET_PREFIX)) return false;
    const [connectionId, fileId, extra] = pathname.slice(GOOGLE_DRIVE_ASSET_PREFIX.length).split("/");
    return !extra && Boolean(connectionId && fileId) && CONNECTION_ID_PATTERN.test(connectionId!) && isGoogleDriveFileId(fileId!);
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
  return value;
}
