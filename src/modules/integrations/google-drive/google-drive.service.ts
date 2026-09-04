import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/db/mongoose";
import { env, isGoogleDriveOAuthConfigured } from "@/lib/env";
import { googleDriveAssetPath } from "@/lib/utils/google-drive-image-url";
import { GoogleDriveConnectionModel } from "@/models/GoogleDriveConnection";
import { STORAGE_ROOT_FOLDER } from "@/modules/integrations/storage/storage.constants";
import { decryptGoogleDriveToken, encryptGoogleDriveToken } from "./token-crypto";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USER_INFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const OAUTH_SCOPES = [DRIVE_FILE_SCOPE, "openid", "email", "profile"] as const;
const ACCESS_TOKEN_FALLBACK_SECONDS = 60 * 60;
const REFRESH_EARLY_MS = 30_000;
const USAGE_CACHE_MS = 5 * 60 * 1000;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type GoogleTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleIdentity = {
  sub?: string;
  email?: string;
  name?: string;
};
type ValidGoogleIdentity = GoogleIdentity & { sub: string };

type ValidAccess = {
  accessToken: string;
  connectionId: string;
};

type GoogleDriveUsage = {
  usedBytes: number;
  limitBytes?: number;
  remainingBytes?: number;
  usedPercent?: number;
  updatedAt?: string;
};

export type GoogleDriveConnectionSummary = {
  id: string;
  label: string;
  accountLabel?: string;
  resourceLabel: string;
  active: boolean;
  health: "connected" | "reconnect-required";
};

const globalState = globalThis as typeof globalThis & {
  googleDriveSetupPromise?: Promise<void>;
  googleDriveRefreshPromises?: Map<string, Promise<ValidAccess>>;
  googleDriveUsageCache?: Map<string, { expiresAt: number; value: GoogleDriveUsage }>;
};
const refreshPromises =
  globalState.googleDriveRefreshPromises ?? new Map<string, Promise<ValidAccess>>();
globalState.googleDriveRefreshPromises = refreshPromises;
const usageCache =
  globalState.googleDriveUsageCache ??
  new Map<string, { expiresAt: number; value: GoogleDriveUsage }>();
globalState.googleDriveUsageCache = usageCache;

async function ensureGoogleDriveStorageReady() {
  await connectMongoose();
  if (!globalState.googleDriveSetupPromise) {
    globalState.googleDriveSetupPromise = (async () => {
      const collection = GoogleDriveConnectionModel.collection;
      await collection.createIndex(
        { userId: 1, googleAccountId: 1 },
        { unique: true, name: "google_drive_user_account_unique" },
      );
      await collection.createIndex(
        { userId: 1, isActive: 1 },
        {
          unique: true,
          name: "google_drive_user_active_unique",
          partialFilterExpression: { isActive: true },
        },
      );
      await collection.createIndex(
        { userId: 1, updatedAt: -1 },
        { name: "google_drive_user_recent" },
      );
    })().catch((error) => {
      delete globalState.googleDriveSetupPromise;
      throw error;
    });
  }
  await globalState.googleDriveSetupPromise;
}

function clientCredentials() {
  if (!isGoogleDriveOAuthConfigured) throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED");
  if (env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET) {
    return {
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      sharedWithAuth: false,
    };
  }
  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
    throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED");
  }
  return {
    clientId: env.AUTH_GOOGLE_ID,
    clientSecret: env.AUTH_GOOGLE_SECRET,
    sharedWithAuth: true,
  };
}

export function createGoogleDriveAuthorizationUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
) {
  const { clientId } = clientCredentials();
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

function parseScopes(value?: string) {
  const scopes = (value ?? "").split(/\s+/).filter(Boolean);
  return scopes.length ? scopes : [...OAUTH_SCOPES];
}

async function tokenRequest(params: URLSearchParams): Promise<GoogleTokenPayload> {
  const { clientId, clientSecret } = clientCredentials();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenPayload;
  if (!response.ok || !payload.access_token) {
    console.error("Google OAuth token request failed", {
      status: response.status,
      error: payload.error,
      description: payload.error_description,
    });
    throw new Error("GOOGLE_DRIVE_RECONNECT_REQUIRED");
  }
  return payload;
}

async function getGoogleIdentity(accessToken: string): Promise<ValidGoogleIdentity> {
  const response = await fetch(USER_INFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  const identity = (await response.json().catch(() => ({}))) as GoogleIdentity;
  if (!response.ok || !identity.sub) throw new Error("GOOGLE_DRIVE_CONNECTION_INVALID");
  return identity as ValidGoogleIdentity;
}

async function verifyGoogleDriveAccess(accessToken: string) {
  const response = await fetch(`${DRIVE_API}/about?fields=user`, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GOOGLE_DRIVE_CONNECTION_INVALID");
}

function objectId(value: string) {
  if (!Types.ObjectId.isValid(value)) throw new Error("NOT_FOUND");
  return new Types.ObjectId(value);
}

export async function exchangeGoogleDriveCode(
  userId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
) {
  const payload = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  );
  const scopes = parseScopes(payload.scope);
  if (payload.scope && !scopes.includes(DRIVE_FILE_SCOPE)) {
    throw new Error("GOOGLE_DRIVE_CONNECTION_INVALID");
  }

  const [identity] = await Promise.all([
    getGoogleIdentity(payload.access_token!),
    verifyGoogleDriveAccess(payload.access_token!),
  ]);
  await ensureGoogleDriveStorageReady();
  const existing = await GoogleDriveConnectionModel.findOne({
    userId,
    googleAccountId: identity.sub,
  })
    .select("+refreshToken rootFolderId")
    .lean();
  const refreshToken = payload.refresh_token
    ? payload.refresh_token
    : existing?.refreshToken
      ? decryptGoogleDriveToken(existing.refreshToken)
      : undefined;
  if (!refreshToken) throw new Error("GOOGLE_DRIVE_CONNECTION_INVALID");

  const now = Date.now();
  const connection = await GoogleDriveConnectionModel.findOneAndUpdate(
    { userId, googleAccountId: identity.sub },
    {
      $set: {
        accountEmail: identity.email?.trim().toLowerCase() ?? "",
        accountName: identity.name?.trim() ?? "",
        reconnectRequired: false,
        accessToken: encryptGoogleDriveToken(payload.access_token!),
        refreshToken: encryptGoogleDriveToken(refreshToken),
        accessTokenExpiresAt: new Date(
          now + (payload.expires_in ?? ACCESS_TOKEN_FALLBACK_SECONDS) * 1000,
        ),
        scope: scopes,
        lastUsedAt: new Date(now),
      },
      $setOnInsert: { isActive: false, rootFolderId: "" },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  if (!connection) throw new Error("GOOGLE_DRIVE_CONNECTION_INVALID");

  return { status: "connected" as const, connectionId: String(connection._id) };
}

export async function listGoogleDriveConnections(
  userId: string,
): Promise<GoogleDriveConnectionSummary[]> {
  await ensureGoogleDriveStorageReady();
  const connections = await GoogleDriveConnectionModel.find({ userId })
    .sort({ isActive: -1, updatedAt: -1 })
    .select({
      accountEmail: 1,
      accountName: 1,
      isActive: 1,
      reconnectRequired: 1,
    })
    .lean();

  return connections.map((connection) => {
    const accountLabel =
      connection.accountEmail?.trim() || connection.accountName?.trim() || "Google Drive";
    return {
      id: String(connection._id),
      label: accountLabel,
      accountLabel,
      resourceLabel: "soydiary/*",
      active: connection.isActive === true,
      health: connection.reconnectRequired ? "reconnect-required" : "connected",
    };
  });
}

export async function activateGoogleDriveConnection(userId: string, connectionId: string) {
  await ensureGoogleDriveStorageReady();
  const _id = objectId(connectionId);
  const collection = GoogleDriveConnectionModel.collection;
  const exists = await collection.findOne({ _id, userId }, { projection: { _id: 1 } });
  if (!exists) throw new Error("NOT_FOUND");
  await collection.updateMany({ userId, isActive: true }, { $set: { isActive: false } });
  const result = await collection.updateOne(
    { _id, userId },
    { $set: { isActive: true, lastUsedAt: new Date() } },
  );
  if (result.matchedCount !== 1) throw new Error("NOT_FOUND");
}

export async function deactivateAllGoogleDriveConnections(userId: string) {
  await ensureGoogleDriveStorageReady();
  await GoogleDriveConnectionModel.collection.updateMany(
    { userId, isActive: true },
    { $set: { isActive: false } },
  );
}

export async function disconnectGoogleDriveConnection(userId: string, connectionId: string) {
  await ensureGoogleDriveStorageReady();
  const _id = objectId(connectionId);
  const connection = await GoogleDriveConnectionModel.findOne({ _id, userId })
    .select("+refreshToken isActive")
    .lean();
  if (!connection) throw new Error("NOT_FOUND");

  // Revoking one token can revoke the combined Google grant for the same
  // client/account. When Drive shares Auth.js credentials, only remove Soy Diary's
  // stored Drive tokens so unlinking storage cannot disrupt Google sign-in.
  if (!clientCredentials().sharedWithAuth) {
    try {
      const token = decryptGoogleDriveToken(connection.refreshToken);
      await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        cache: "no-store",
      });
    } catch {
      // Local unlink must still work if Google has already revoked the grant.
    }
  }

  await GoogleDriveConnectionModel.deleteOne({ _id, userId });
  refreshPromises.delete(`${userId}:${connectionId}`);
  usageCache.delete(`${userId}:${connectionId}`);
  return { wasActive: connection.isActive === true };
}

async function markReconnectRequired(userId: string, connectionId: string) {
  await GoogleDriveConnectionModel.updateOne(
    { _id: objectId(connectionId), userId },
    { $set: { reconnectRequired: true } },
  ).catch(() => undefined);
}

async function refreshGoogleDriveAccess(
  userId: string,
  connectionId: string,
): Promise<ValidAccess> {
  const connection = await GoogleDriveConnectionModel.findOne({
    _id: objectId(connectionId),
    userId,
  })
    .select("+refreshToken")
    .lean();
  if (!connection) throw new Error("NOT_FOUND");

  let payload: GoogleTokenPayload;
  try {
    payload = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptGoogleDriveToken(connection.refreshToken),
      }),
    );
  } catch {
    await markReconnectRequired(userId, connectionId);
    throw new Error("GOOGLE_DRIVE_RECONNECT_REQUIRED");
  }

  const now = Date.now();
  await GoogleDriveConnectionModel.updateOne(
    { _id: connection._id, userId },
    {
      $set: {
        accessToken: encryptGoogleDriveToken(payload.access_token!),
        accessTokenExpiresAt: new Date(
          now + (payload.expires_in ?? ACCESS_TOKEN_FALLBACK_SECONDS) * 1000,
        ),
        reconnectRequired: false,
        ...(payload.scope ? { scope: parseScopes(payload.scope) } : {}),
      },
    },
  );
  return { accessToken: payload.access_token!, connectionId };
}

async function getValidGoogleDriveAccessForConnection(
  userId: string,
  connectionId: string,
): Promise<ValidAccess> {
  if (!isGoogleDriveOAuthConfigured) throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED");
  await ensureGoogleDriveStorageReady();
  const connection = await GoogleDriveConnectionModel.findOne({
    _id: objectId(connectionId),
    userId,
  })
    .select("+accessToken")
    .lean();
  if (!connection) throw new Error("NOT_FOUND");
  if (connection.reconnectRequired) throw new Error("GOOGLE_DRIVE_RECONNECT_REQUIRED");

  if (new Date(connection.accessTokenExpiresAt).getTime() - REFRESH_EARLY_MS > Date.now()) {
    return {
      accessToken: decryptGoogleDriveToken(connection.accessToken),
      connectionId,
    };
  }

  const refreshKey = `${userId}:${connectionId}`;
  const existing = refreshPromises.get(refreshKey);
  if (existing) return existing;
  const promise = refreshGoogleDriveAccess(userId, connectionId).finally(() =>
    refreshPromises.delete(refreshKey),
  );
  refreshPromises.set(refreshKey, promise);
  return promise;
}

async function getActiveGoogleDriveAccess(userId: string) {
  await ensureGoogleDriveStorageReady();
  const connection = await GoogleDriveConnectionModel.findOne({ userId, isActive: true })
    .select({ _id: 1 })
    .lean();
  if (!connection) throw new Error("GOOGLE_DRIVE_RECONNECT_REQUIRED");
  return getValidGoogleDriveAccessForConnection(userId, String(connection._id));
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("GOOGLE_DRIVE_RECONNECT_REQUIRED");
  return response;
}

async function withRefreshedAccess<T>(
  userId: string,
  access: ValidAccess,
  action: (accessToken: string) => Promise<T>,
) {
  try {
    return await action(access.accessToken);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "GOOGLE_DRIVE_RECONNECT_REQUIRED") {
      throw error;
    }
    const refreshed = await refreshGoogleDriveAccess(userId, access.connectionId);
    return action(refreshed.accessToken);
  }
}

export async function getGoogleDriveConnectionUsage(
  userId: string,
  connectionId: string,
): Promise<GoogleDriveUsage> {
  const cacheKey = `${userId}:${connectionId}`;
  const cached = usageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const access = await getValidGoogleDriveAccessForConnection(userId, connectionId);
  const usage = await withRefreshedAccess(userId, access, async (accessToken) => {
    const response = await driveFetch(accessToken, `${DRIVE_API}/about?fields=storageQuota`);
    const payload = (await response.json().catch(() => ({}))) as {
      storageQuota?: { limit?: string; usage?: string };
    };
    if (!response.ok || !payload.storageQuota) throw new Error("GOOGLE_DRIVE_USAGE_FAILED");
    const usedBytes = Math.max(0, Number(payload.storageQuota.usage) || 0);
    const rawLimit = Number(payload.storageQuota.limit);
    const limitBytes = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
    return {
      usedBytes,
      ...(limitBytes
        ? {
            limitBytes,
            remainingBytes: Math.max(0, limitBytes - usedBytes),
            usedPercent: Math.min(100, (usedBytes / limitBytes) * 100),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };
  });
  usageCache.set(cacheKey, { expiresAt: Date.now() + USAGE_CACHE_MS, value: usage });
  return usage;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(accessToken: string, name: string, parentId: string) {
  const params = new URLSearchParams({
    q: `name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and '${escapeDriveQuery(parentId)}' in parents and trashed = false`,
    spaces: "drive",
    pageSize: "1",
    fields: "files(id,name)",
  });
  const response = await driveFetch(accessToken, `${DRIVE_API}/files?${params}`);
  const payload = (await response.json().catch(() => ({}))) as { files?: Array<{ id?: string }> };
  if (!response.ok) throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");
  return payload.files?.[0]?.id;
}

async function createFolder(accessToken: string, name: string, parentId: string) {
  const response = await driveFetch(accessToken, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentId],
      appProperties: { soydiaryManaged: "true" },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { id?: string };
  if (!response.ok || !payload.id) throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");
  return payload.id;
}

async function ensureFolder(accessToken: string, name: string, parentId: string) {
  return (
    (await findFolder(accessToken, name, parentId)) ??
    (await createFolder(accessToken, name, parentId))
  );
}

async function ensureFolderPath(
  userId: string,
  connectionId: string,
  accessToken: string,
  folderPath: string,
) {
  const parts = folderPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0] !== STORAGE_ROOT_FOLDER) throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");

  let parentId = "root";
  let rootFolderId = "";
  for (const part of parts) {
    parentId = await ensureFolder(accessToken, part, parentId);
    if (!rootFolderId) rootFolderId = parentId;
  }
  await GoogleDriveConnectionModel.updateOne(
    { _id: objectId(connectionId), userId },
    { $set: { rootFolderId } },
  ).catch(() => undefined);
  return parentId;
}

function safeFileName(file: File, uploadKey: string) {
  const original =
    file.name
      .replace(/[\\/\0]/g, "-")
      .trim()
      .slice(0, 160) || "media";
  return `${uploadKey}-${original}`;
}

async function deleteDriveFile(accessToken: string, fileId: string) {
  await driveFetch(accessToken, `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

async function findUploadedMedia(
  accessToken: string,
  folderId: string,
  uploadKey: string,
) {
  const params = new URLSearchParams({
    q: `appProperties has { key='soydiaryUploadKey' and value='${escapeDriveQuery(uploadKey)}' } and '${escapeDriveQuery(folderId)}' in parents and trashed = false`,
    spaces: "drive",
    pageSize: "1",
    fields: "files(id)",
  });
  const response = await driveFetch(accessToken, `${DRIVE_API}/files?${params}`);
  const payload = (await response.json().catch(() => ({}))) as { files?: Array<{ id?: string }> };
  if (!response.ok) throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");
  return payload.files?.[0]?.id;
}

async function uploadMedia(
  accessToken: string,
  file: File,
  folderId: string,
  uploadKey: string,
  connectionId: string,
  kind: "image" | "video",
): Promise<{ secureUrl: string; publicId: string; kind: "image" | "video"; mimeType: string }> {
  const existingFileId = await findUploadedMedia(accessToken, folderId, uploadKey);
  if (existingFileId) {
    return {
      secureUrl: googleDriveAssetPath(connectionId, existingFileId),
      publicId: existingFileId,
      kind,
      mimeType: file.type,
    };
  }
  const boundary = `soydiary_${randomBytes(12).toString("hex")}`;
  const metadata = {
    name: safeFileName(file, uploadKey),
    parents: [folderId],
    appProperties: {
      soydiaryManaged: "true",
      soydiaryAssetType: kind,
      soydiaryUploadKey: uploadKey,
    },
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    ),
    Buffer.from(await file.arrayBuffer()),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const uploaded = (await response.json().catch(() => ({}))) as {
    id?: string;
  };
  if (!response.ok || !uploaded.id) throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");

  const secureUrl = googleDriveAssetPath(connectionId, uploaded.id);
  return { secureUrl, publicId: uploaded.id, kind, mimeType: file.type };
}

export async function downloadGoogleDriveMedia(
  userId: string,
  connectionId: string,
  fileId: string,
  range?: string,
) {
  await ensureGoogleDriveStorageReady();
  const otherConnections = await GoogleDriveConnectionModel.find({ userId })
    .select({ _id: 1 })
    .lean();
  const candidates = [
    connectionId,
    ...otherConnections.map((connection) => String(connection._id)),
  ].filter((value, index, values) => values.indexOf(value) === index);

  for (const candidate of candidates) {
    try {
      const access = await getValidGoogleDriveAccessForConnection(userId, candidate);
      const response = await withRefreshedAccess(userId, access, (accessToken) =>
        driveFetch(
          accessToken,
          `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
          {
            headers: {
              accept: "image/avif,image/webp,image/apng,image/*,video/mp4,video/webm,video/quicktime,video/*",
              ...(range ? { range } : {}),
            },
          },
        ),
      );
      if (response.ok || response.status === 416) return response;
      if (response.status !== 404) throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code !== "NOT_FOUND" && code !== "GOOGLE_DRIVE_RECONNECT_REQUIRED") throw error;
    }
  }
  throw new Error("NOT_FOUND");
}

export async function uploadMediaToGoogleDrive(
  userId: string,
  entries: Array<{ key: string; file: File; kind: "image" | "video" }>,
  folder: string,
) {
  const access = await getActiveGoogleDriveAccess(userId);
  return withRefreshedAccess(userId, access, async (accessToken) => {
    const folderId = await ensureFolderPath(userId, access.connectionId, accessToken, folder);
    const results: Array<
      | { key: string; ok: true; secureUrl: string; publicId: string; kind: "image" | "video"; mimeType: string }
      | { key: string; ok: false; error: string }
    > = [];
    const concurrency = 3;

    for (let offset = 0; offset < entries.length; offset += concurrency) {
      const chunk = entries.slice(offset, offset + concurrency);
      results.push(
        ...(await Promise.all(
          chunk.map(async ({ key, file, kind }) => {
            try {
              return {
                key,
                ok: true as const,
                ...(await uploadMedia(accessToken, file, folderId, key, access.connectionId, kind)),
              };
            } catch (error) {
              if (error instanceof Error && error.message === "GOOGLE_DRIVE_RECONNECT_REQUIRED") {
                throw error;
              }
              return {
                key,
                ok: false as const,
                error: error instanceof Error ? error.message : "GOOGLE_DRIVE_UPLOAD_FAILED",
              };
            }
          }),
        )),
      );
    }

    if (results.some((result) => result.ok)) {
      usageCache.delete(`${userId}:${access.connectionId}`);
      await GoogleDriveConnectionModel.updateOne(
        { _id: objectId(access.connectionId), userId },
        { $set: { lastUsedAt: new Date() } },
      ).catch(() => undefined);
    }
    return results;
  });
}
