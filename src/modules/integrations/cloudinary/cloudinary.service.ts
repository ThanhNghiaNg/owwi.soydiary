import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/db/mongoose";
import { env, isCloudinaryOAuthConfigured } from "@/lib/env";
import { CloudinaryConnectionModel } from "@/models/CloudinaryConnection";
import { decryptCloudinaryToken, encryptCloudinaryToken } from "./token-crypto";

const MCP_ORIGIN = "https://asset-management.mcp.cloudinary.com";
const MCP_ENDPOINT = `${MCP_ORIGIN}/mcp`;
const MCP_AUTHORIZATION_ENDPOINT = `${MCP_ORIGIN}/authorize`;
const MCP_TOKEN_ENDPOINT = `${MCP_ORIGIN}/token`;
const MCP_REGISTRATION_ENDPOINT = `${MCP_ORIGIN}/register`;
const MCP_RESOURCE = MCP_ORIGIN;
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_SCOPES = ["openid", "offline_access", "asset_management", "upload"] as const;
const DEFAULT_UPLOAD_PREFIX = "https://api.cloudinary.com";
const ACCESS_TOKEN_FALLBACK_SECONDS = 5 * 60;
const REFRESH_TOKEN_FALLBACK_SECONDS = 90 * 24 * 60 * 60;
const REFRESH_EARLY_MS = 30_000;
const CLOUD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{1,127}$/;

export type CloudinaryTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string | string[];
  token_type?: string;
  [key: string]: unknown;
};

type McpRegistrationPayload = {
  client_id?: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
  [key: string]: unknown;
};

type CloudinaryAuthorizationAttempt = {
  authorizationUrl: URL;
  clientId: string;
  codeVerifier: string;
};

type ValidAccess = {
  accessToken: string;
  clientId: string;
  connectionId: string;
};

type CloudinaryStorageUsage = {
  usedBytes: number;
  limitBytes?: number;
  remainingBytes?: number;
  usedPercent?: number;
  updatedAt?: string;
};

const USAGE_CACHE_MS = 5 * 60 * 1000;

type SignedUploadCredential = {
  uploadParams: Record<string, unknown>;
  apiKey: string;
  signature: string;
  host: string;
  cloudName: string;
};

const globalRefresh = globalThis as typeof globalThis & {
  cloudinaryRefreshPromises?: Map<string, Promise<ValidAccess>>;
  cloudinaryUsageCache?: Map<string, { expiresAt: number; value: CloudinaryStorageUsage }>;
};
const refreshPromises =
  globalRefresh.cloudinaryRefreshPromises ?? new Map<string, Promise<ValidAccess>>();
globalRefresh.cloudinaryRefreshPromises = refreshPromises;
const usageCache =
  globalRefresh.cloudinaryUsageCache ??
  new Map<string, { expiresAt: number; value: CloudinaryStorageUsage }>();
globalRefresh.cloudinaryUsageCache = usageCache;

const globalConnectionSetup = globalThis as typeof globalThis & {
  cloudinaryMultiConnectionSetup?: Promise<void>;
};

async function ensureCloudinaryConnectionStorageReady() {
  await connectMongoose();
  if (!globalConnectionSetup.cloudinaryMultiConnectionSetup) {
    globalConnectionSetup.cloudinaryMultiConnectionSetup = (async () => {
      const collection = CloudinaryConnectionModel.collection;
      const indexes = await collection.indexes().catch(() => []);
      for (const index of indexes) {
        const key = index.key as Record<string, number> | undefined;
        if (
          index.unique === true &&
          key &&
          Object.keys(key).length === 1 &&
          key.userId === 1 &&
          index.name
        ) {
          // Older Soyplay versions allowed one Cloudinary connection per user via
          // a unique userId index. Drop only that legacy index so multiple
          // connections can coexist without requiring a manual DB migration.
          await collection.dropIndex(index.name).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            if (!/index not found/i.test(message)) throw error;
          });
        }
      }

      await collection.createIndex(
        { userId: 1, cloudName: 1 },
        { unique: true, name: "cloudinary_user_cloud_unique" },
      );
      await collection.createIndex(
        { userId: 1, isActive: 1 },
        {
          unique: true,
          name: "cloudinary_user_active_unique",
          partialFilterExpression: { isActive: true },
        },
      );
      await collection.createIndex(
        { userId: 1, updatedAt: -1 },
        { name: "cloudinary_user_recent" },
      );
    })().catch((error) => {
      globalConnectionSetup.cloudinaryMultiConnectionSetup = undefined;
      throw error;
    });
  }
  await globalConnectionSetup.cloudinaryMultiConnectionSetup;
}

export function cloudinaryRedirectUri() {
  return new URL("/api/integrations/cloudinary/callback", env.NEXT_PUBLIC_APP_URL).toString();
}

function parseScope(scope: CloudinaryTokenPayload["scope"]) {
  if (Array.isArray(scope)) return scope.filter((value): value is string => typeof value === "string");
  if (typeof scope === "string") return scope.split(/[\s,]+/).filter(Boolean);
  return [...MCP_SCOPES];
}

function normalizeCloudName(value: string) {
  const cloudName = value.trim();
  if (!CLOUD_NAME_PATTERN.test(cloudName)) throw new Error("CLOUDINARY_CONNECTION_INVALID");
  return cloudName;
}

function normalizeUploadPrefix(host: string) {
  const value = host.trim();
  if (!value) return DEFAULT_UPLOAD_PREFIX;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_UPLOAD_PREFIX;
  }
}

async function registerMcpClient(): Promise<{ clientId: string }> {
  const response = await fetch(MCP_REGISTRATION_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_name: "Soy Diary",
      redirect_uris: [cloudinaryRedirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: MCP_SCOPES.join(" "),
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as McpRegistrationPayload & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.client_id) {
    console.error("Cloudinary MCP client registration failed", {
      status: response.status,
      error: payload.error,
      description: payload.error_description,
    });
    throw new Error("CLOUDINARY_CONNECTION_INVALID");
  }

  const authMethod =
    payload.token_endpoint_auth_method ?? (payload.client_secret ? "client_secret_basic" : "none");
  if (authMethod !== "none") throw new Error("CLOUDINARY_CONNECTION_INVALID");

  return { clientId: payload.client_id };
}

export async function createCloudinaryAuthorizationAttempt(
  userId: string,
  state: string,
): Promise<CloudinaryAuthorizationAttempt> {
  if (!isCloudinaryOAuthConfigured) throw new Error("CLOUDINARY_NOT_CONFIGURED");

  await ensureCloudinaryConnectionStorageReady();
  const existing = await CloudinaryConnectionModel.findOne({ userId })
    .sort({ updatedAt: -1 })
    .select({ oauthClientId: 1 })
    .lean();
  const registration = existing?.oauthClientId?.trim()
    ? { clientId: existing.oauthClientId.trim() }
    : await registerMcpClient();
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL(MCP_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", registration.clientId);
  url.searchParams.set("redirect_uri", cloudinaryRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", MCP_SCOPES.join(" "));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", MCP_RESOURCE);

  return {
    authorizationUrl: url,
    clientId: registration.clientId,
    codeVerifier,
  };
}

async function tokenRequest(
  params: URLSearchParams,
  clientId: string,
): Promise<CloudinaryTokenPayload> {
  params.set("client_id", clientId);
  params.set("resource", MCP_RESOURCE);

  const response = await fetch(MCP_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as CloudinaryTokenPayload & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    console.error("Cloudinary MCP token request failed", {
      status: response.status,
      error: payload.error,
      description: payload.error_description,
    });
    throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  }
  return payload;
}

type CloudinaryMcpIdentity = {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

async function getCloudinaryMcpIdentity(accessToken: string): Promise<CloudinaryMcpIdentity> {
  try {
    const response = await fetch(`${MCP_ORIGIN}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return {};
    const payload = (await response.json().catch(() => ({}))) as CloudinaryMcpIdentity;
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function parseJsonOrSse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Streamable HTTP may answer as text/event-stream.
  }

  const values = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return line;
      }
    });
  return values.length === 1 ? values[0] : values.length ? values : text;
}

type McpSession = {
  sessionId?: string;
  protocolVersion: string;
};

async function mcpRequest(
  accessToken: string,
  body: Record<string, unknown>,
  session?: McpSession,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };
  if (session) {
    headers["MCP-Protocol-Version"] = session.protocolVersion;
    if (session.sessionId) headers["Mcp-Session-Id"] = session.sessionId;
  }

  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = parseJsonOrSse(await response.text());
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
    }
    console.error("Cloudinary MCP request failed", { status: response.status });
    throw new Error("CLOUDINARY_UPLOAD_FAILED");
  }
  return { response, payload };
}

function resultRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = resultRecord(item);
      if (result) return result;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const result = record.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return undefined;
}

async function initializeMcp(accessToken: string): Promise<McpSession> {
  const initialized = await mcpRequest(accessToken, {
    jsonrpc: "2.0",
    id: `soyplay-init-${randomBytes(6).toString("hex")}`,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "Soyplay", version: "1" },
    },
  });

  const result = resultRecord(initialized.payload);
  if (!result) throw new Error("CLOUDINARY_CONNECTION_INVALID");
  const protocolVersion =
    typeof result.protocolVersion === "string" ? result.protocolVersion : MCP_PROTOCOL_VERSION;
  const session: McpSession = {
    protocolVersion,
    sessionId: initialized.response.headers.get("mcp-session-id") ?? undefined,
  };

  await mcpRequest(
    accessToken,
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    },
    session,
  );
  return session;
}

function parseNestedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function toSignedUploadCredential(value: unknown): SignedUploadCredential | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const uploadParams = record.upload_params;
  const apiKey = record.api_key;
  const signature = record.signature;
  const host = record.host;
  const cloudName = record.cloud_name;
  if (
    !uploadParams ||
    typeof uploadParams !== "object" ||
    Array.isArray(uploadParams) ||
    typeof apiKey !== "string" ||
    typeof signature !== "string" ||
    typeof host !== "string" ||
    typeof cloudName !== "string"
  ) {
    return undefined;
  }

  return {
    uploadParams: uploadParams as Record<string, unknown>,
    apiKey,
    signature,
    host,
    cloudName: normalizeCloudName(cloudName),
  };
}

function findSignedCredentials(
  value: unknown,
  depth = 0,
): SignedUploadCredential[] | undefined {
  if (depth > 10) return undefined;
  const parsed = parseNestedJson(value);
  if (parsed !== value) return findSignedCredentials(parsed, depth + 1);

  if (Array.isArray(parsed)) {
    const directCredentials = parsed.map(toSignedUploadCredential);
    if (directCredentials.length > 0 && directCredentials.every(Boolean)) {
      // sign-upload returns one credential per input entry in the same order.
      // Identical upload params can legitimately produce identical signatures,
      // so duplicate credentials must be preserved rather than deduplicated.
      return directCredentials as SignedUploadCredential[];
    }

    for (const item of parsed) {
      const found = findSignedCredentials(item, depth + 1);
      if (found?.length) return found;
    }
    return undefined;
  }

  const directCredential = toSignedUploadCredential(parsed);
  if (directCredential) return [directCredential];
  if (!parsed || typeof parsed !== "object") return undefined;

  const record = parsed as Record<string, unknown>;
  // MCP tool results can expose the same logical payload in more than one
  // representation (for example structured content plus text content). Search
  // one branch at a time and use the first credential list we find so mirrored
  // representations are not counted twice.
  const preferredKeys = ["structuredContent", "content", "result", "data"] as const;
  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    const found = findSignedCredentials(record[key], depth + 1);
    if (found?.length) return found;
  }

  for (const [key, child] of Object.entries(record)) {
    if ((preferredKeys as readonly string[]).includes(key)) continue;
    const found = findSignedCredentials(child, depth + 1);
    if (found?.length) return found;
  }
  return undefined;
}

async function signUploads(accessToken: string, uploads: Array<Record<string, unknown>>) {
  const session = await initializeMcp(accessToken);
  const { payload } = await mcpRequest(accessToken, {
    jsonrpc: "2.0",
    id: `soyplay-sign-${randomBytes(6).toString("hex")}`,
    method: "tools/call",
    params: {
      name: "sign-upload",
      arguments: { uploads },
    },
  }, session);

  const credentials = findSignedCredentials(payload) ?? [];
  if (credentials.length !== uploads.length) {
    console.error("Cloudinary MCP sign-upload returned an unexpected result", {
      expected: uploads.length,
      received: credentials.length,
    });
    throw new Error("CLOUDINARY_CONNECTION_INVALID");
  }
  return credentials;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function findStorageUsage(value: unknown, depth = 0): CloudinaryStorageUsage | undefined {
  if (depth > 10) return undefined;
  const parsed = parseNestedJson(value);
  if (parsed !== value) return findStorageUsage(parsed, depth + 1);

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findStorageUsage(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const record = parsed as Record<string, unknown>;
  const storage = record.storage;
  if (storage && typeof storage === "object" && !Array.isArray(storage)) {
    const metric = storage as Record<string, unknown>;
    const usedBytes = finiteNumber(metric.usage);
    if (usedBytes !== undefined) {
      const limitBytes = finiteNumber(metric.limit);
      const reportedPercent = finiteNumber(metric.used_percent);
      const usedPercent =
        reportedPercent ??
        (limitBytes && limitBytes > 0 ? (usedBytes / limitBytes) * 100 : undefined);
      return {
        usedBytes: Math.max(0, usedBytes),
        limitBytes: limitBytes !== undefined && limitBytes > 0 ? limitBytes : undefined,
        remainingBytes:
          limitBytes !== undefined && limitBytes > 0
            ? Math.max(0, limitBytes - usedBytes)
            : undefined,
        usedPercent:
          usedPercent !== undefined ? Math.max(0, Math.min(100, usedPercent)) : undefined,
        updatedAt:
          typeof record.last_updated === "string"
            ? record.last_updated
            : typeof record.date_requested === "string"
              ? record.date_requested
              : undefined,
      };
    }
  }

  const preferredKeys = ["structuredContent", "content", "result", "data"] as const;
  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    const found = findStorageUsage(record[key], depth + 1);
    if (found) return found;
  }
  for (const [key, child] of Object.entries(record)) {
    if ((preferredKeys as readonly string[]).includes(key)) continue;
    const found = findStorageUsage(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function fetchCloudinaryStorageUsage(accessToken: string) {
  const session = await initializeMcp(accessToken);
  const { payload } = await mcpRequest(
    accessToken,
    {
      jsonrpc: "2.0",
      id: `soyplay-usage-${randomBytes(6).toString("hex")}`,
      method: "tools/call",
      params: {
        name: "get-usage-details",
        arguments: {},
      },
    },
    session,
  );
  const usage = findStorageUsage(payload);
  if (!usage) {
    console.error("Cloudinary MCP get-usage-details returned an unexpected result");
    throw new Error("CLOUDINARY_USAGE_FAILED");
  }
  return usage;
}

export type CloudinaryConnectionSummary = {
  id: string;
  label: string;
  accountLabel?: string;
  resourceLabel: string;
  active: boolean;
  health: "connected" | "reconnect-required";
};

function objectId(value: string) {
  if (!Types.ObjectId.isValid(value)) throw new Error("NOT_FOUND");
  return new Types.ObjectId(value);
}

function cloudinaryConnectionHealth(refreshTokenExpiresAt: Date | string) {
  return new Date(refreshTokenExpiresAt).getTime() > Date.now()
    ? ("connected" as const)
    : ("reconnect-required" as const);
}

export async function exchangeCloudinaryCode(
  userId: string,
  code: string,
  clientId: string,
  codeVerifier: string,
) {
  const payload = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cloudinaryRedirectUri(),
      code_verifier: codeVerifier,
    }),
    clientId,
  );

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("CLOUDINARY_CONNECTION_INVALID");
  }

  // sign-upload performs no upload. It gives Soyplay the product environment
  // selected by the user during MCP OAuth plus short-lived signed upload data.
  const [[probe], identity] = await Promise.all([
    signUploads(payload.access_token, [{ folder: "soyplay" }]),
    getCloudinaryMcpIdentity(payload.access_token),
  ]);
  if (!probe) throw new Error("CLOUDINARY_CONNECTION_INVALID");

  const now = Date.now();
  const accountEmail =
    identity.email?.trim().toLowerCase() ||
    (identity.sub?.includes("@") ? identity.sub.trim().toLowerCase() : "");
  const accountName = identity.name?.trim() || identity.preferred_username?.trim() || "";

  await ensureCloudinaryConnectionStorageReady();
  const connection = await CloudinaryConnectionModel.findOneAndUpdate(
    { userId, cloudName: probe.cloudName },
    {
      $set: {
        oauthClientId: clientId,
        cloudName: probe.cloudName,
        accountSubject: identity.sub?.trim() ?? "",
        accountEmail,
        accountName,
        accessToken: encryptCloudinaryToken(payload.access_token),
        refreshToken: encryptCloudinaryToken(payload.refresh_token),
        accessTokenExpiresAt: new Date(
          now + (payload.expires_in ?? ACCESS_TOKEN_FALLBACK_SECONDS) * 1000,
        ),
        refreshTokenExpiresAt: new Date(
          now + (payload.refresh_token_expires_in ?? REFRESH_TOKEN_FALLBACK_SECONDS) * 1000,
        ),
        scope: parseScope(payload.scope),
        uploadPrefix: normalizeUploadPrefix(probe.host),
        lastUsedAt: new Date(now),
      },
      $setOnInsert: { isActive: false },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  if (!connection) throw new Error("CLOUDINARY_CONNECTION_INVALID");

  return {
    status: "connected" as const,
    connectionId: String(connection._id),
    cloudName: probe.cloudName,
  };
}

export async function listCloudinaryConnections(
  userId: string,
): Promise<CloudinaryConnectionSummary[]> {
  await ensureCloudinaryConnectionStorageReady();
  const connections = await CloudinaryConnectionModel.find({ userId })
    .sort({ isActive: -1, updatedAt: -1 })
    .select({
      cloudName: 1,
      accountEmail: 1,
      accountName: 1,
      isActive: 1,
      refreshTokenExpiresAt: 1,
    })
    .lean();

  return connections.map((connection) => {
    const cloudName = connection.cloudName?.trim() || "Cloudinary";
    const accountLabel = connection.accountEmail?.trim() || connection.accountName?.trim() || undefined;
    return {
      id: String(connection._id),
      label: accountLabel || cloudName,
      accountLabel,
      resourceLabel: cloudName,
      active: connection.isActive === true,
      health: cloudinaryConnectionHealth(connection.refreshTokenExpiresAt),
    };
  });
}

export async function activateCloudinaryConnection(userId: string, connectionId: string) {
  await ensureCloudinaryConnectionStorageReady();
  const _id = objectId(connectionId);
  const collection = CloudinaryConnectionModel.collection;

  // Use the raw collection for the active flag. In Next.js dev mode Mongoose can
  // keep an already-compiled model across HMR; raw writes make this migration-safe
  // even if an older cached schema did not yet contain `isActive`.
  const exists = await collection.findOne({ _id, userId }, { projection: { _id: 1 } });
  if (!exists) throw new Error("NOT_FOUND");

  await collection.updateMany(
    { userId, isActive: true },
    { $set: { isActive: false } },
  );
  const result = await collection.updateOne(
    { _id, userId },
    { $set: { isActive: true, lastUsedAt: new Date() } },
  );
  if (result.matchedCount !== 1) throw new Error("NOT_FOUND");

  const active = await collection.findOne(
    { _id, userId },
    { projection: { isActive: 1 } },
  );
  if (active?.isActive !== true) throw new Error("STORAGE_ACTIVATION_FAILED");
}

export async function deactivateAllCloudinaryConnections(userId: string) {
  await ensureCloudinaryConnectionStorageReady();
  await CloudinaryConnectionModel.collection.updateMany(
    { userId, isActive: true },
    { $set: { isActive: false } },
  );
}

export async function disconnectCloudinaryConnection(userId: string, connectionId: string) {
  await ensureCloudinaryConnectionStorageReady();
  const _id = objectId(connectionId);
  const connection = await CloudinaryConnectionModel.findOne({ _id, userId })
    .select({ isActive: 1 })
    .lean();
  if (!connection) throw new Error("NOT_FOUND");
  await CloudinaryConnectionModel.deleteOne({ _id, userId });
  refreshPromises.delete(`${userId}:${connectionId}`);
  usageCache.delete(`${userId}:${connectionId}`);
  return { wasActive: connection.isActive === true };
}

export async function getCloudinaryStatus(userId: string) {
  if (!isCloudinaryOAuthConfigured) {
    return { configured: false, connected: false } as const;
  }

  const connections = await listCloudinaryConnections(userId);
  const active = connections.find((connection) => connection.active);
  return {
    configured: true,
    connected: active?.health === "connected",
    cloudName: active?.resourceLabel,
    connectionId: active?.id,
    accountLabel: active?.accountLabel,
    connectionCount: connections.length,
  } as const;
}

async function getActiveCloudinaryConnection(userId: string, includeSecrets = false) {
  await ensureCloudinaryConnectionStorageReady();
  const query = CloudinaryConnectionModel.findOne({ userId, isActive: true });
  if (includeSecrets) query.select("+accessToken +refreshToken");
  return query.lean();
}

async function refreshCloudinaryAccess(
  userId: string,
  connectionId: string,
): Promise<ValidAccess> {
  await ensureCloudinaryConnectionStorageReady();
  const _id = objectId(connectionId);
  const connection = await CloudinaryConnectionModel.findOne({ _id, userId })
    .select("+accessToken +refreshToken")
    .lean();
  if (
    !connection ||
    !connection.oauthClientId?.trim() ||
    new Date(connection.refreshTokenExpiresAt).getTime() <= Date.now()
  ) {
    throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  }

  const currentRefreshToken = decryptCloudinaryToken(connection.refreshToken);
  let payload: CloudinaryTokenPayload;
  try {
    payload = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
      }),
      connection.oauthClientId,
    );
  } catch {
    throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  }

  if (!payload.access_token) throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  const nextRefreshToken = payload.refresh_token ?? currentRefreshToken;
  const now = Date.now();
  await CloudinaryConnectionModel.updateOne(
    { _id: connection._id, userId },
    {
      $set: {
        accessToken: encryptCloudinaryToken(payload.access_token),
        refreshToken: encryptCloudinaryToken(nextRefreshToken),
        accessTokenExpiresAt: new Date(
          now + (payload.expires_in ?? ACCESS_TOKEN_FALLBACK_SECONDS) * 1000,
        ),
        refreshTokenExpiresAt: new Date(
          now + (payload.refresh_token_expires_in ?? REFRESH_TOKEN_FALLBACK_SECONDS) * 1000,
        ),
        scope: parseScope(payload.scope),
      },
    },
  );

  return {
    accessToken: payload.access_token,
    clientId: connection.oauthClientId,
    connectionId: String(connection._id),
  };
}

async function getValidCloudinaryAccessForConnection(
  userId: string,
  connectionId: string,
): Promise<ValidAccess> {
  if (!isCloudinaryOAuthConfigured) throw new Error("CLOUDINARY_NOT_CONFIGURED");
  await ensureCloudinaryConnectionStorageReady();
  const _id = objectId(connectionId);
  const connection = await CloudinaryConnectionModel.findOne({ _id, userId })
    .select("+accessToken +refreshToken")
    .lean();
  if (!connection || !connection.oauthClientId?.trim()) throw new Error("NOT_FOUND");

  if (new Date(connection.refreshTokenExpiresAt).getTime() <= Date.now()) {
    throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  }
  if (new Date(connection.accessTokenExpiresAt).getTime() - REFRESH_EARLY_MS > Date.now()) {
    return {
      accessToken: decryptCloudinaryToken(connection.accessToken),
      clientId: connection.oauthClientId,
      connectionId,
    };
  }

  const refreshKey = `${userId}:${connectionId}`;
  const existing = refreshPromises.get(refreshKey);
  if (existing) return existing;
  const promise = refreshCloudinaryAccess(userId, connectionId).finally(() =>
    refreshPromises.delete(refreshKey),
  );
  refreshPromises.set(refreshKey, promise);
  return promise;
}

export async function getValidCloudinaryAccess(userId: string): Promise<ValidAccess> {
  const connection = await getActiveCloudinaryConnection(userId);
  if (!connection) throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  return getValidCloudinaryAccessForConnection(userId, String(connection._id));
}

export async function getCloudinaryConnectionUsage(
  userId: string,
  connectionId: string,
): Promise<CloudinaryStorageUsage> {
  const cacheKey = `${userId}:${connectionId}`;
  const cached = usageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let access = await getValidCloudinaryAccessForConnection(userId, connectionId);
  let usage: CloudinaryStorageUsage;
  try {
    usage = await fetchCloudinaryStorageUsage(access.accessToken);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "CLOUDINARY_RECONNECT_REQUIRED") {
      throw error;
    }
    access = await refreshCloudinaryAccess(userId, connectionId);
    usage = await fetchCloudinaryStorageUsage(access.accessToken);
  }

  usageCache.set(cacheKey, { expiresAt: Date.now() + USAGE_CACHE_MS, value: usage });
  return usage;
}

function appendSignedParam(body: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (typeof value === "string") {
    body.append(key, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    body.append(key, String(value));
    return;
  }
  body.append(key, JSON.stringify(value));
}

async function uploadImageWithSignature(
  credential: SignedUploadCredential,
  file: File,
): Promise<{ secureUrl: string; publicId: string }> {
  const body = new FormData();
  body.append("file", file, file.name);
  body.append("api_key", credential.apiKey);
  body.append("signature", credential.signature);
  Object.entries(credential.uploadParams).forEach(([key, value]) => appendSignedParam(body, key, value));

  const endpoint = `${normalizeUploadPrefix(credential.host)}/v1_1/${encodeURIComponent(credential.cloudName)}/image/upload`;
  const response = await fetch(endpoint, {
    method: "POST",
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    secure_url?: string;
    public_id?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.secure_url || !payload.public_id) {
    console.error("Cloudinary signed image upload failed", {
      status: response.status,
      message: payload.error?.message,
    });
    throw new Error("CLOUDINARY_UPLOAD_FAILED");
  }
  return { secureUrl: payload.secure_url, publicId: payload.public_id };
}

async function signChunk(
  userId: string,
  access: ValidAccess,
  count: number,
  folder: string,
): Promise<{ access: ValidAccess; credentials: SignedUploadCredential[] }> {
  const uploads = Array.from({ length: count }, () => ({
    folder,
    use_filename: true,
    unique_filename: true,
  }));
  try {
    return { access, credentials: await signUploads(access.accessToken, uploads) };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "CLOUDINARY_RECONNECT_REQUIRED") throw error;
    const refreshed = await refreshCloudinaryAccess(userId, access.connectionId);
    return { access: refreshed, credentials: await signUploads(refreshed.accessToken, uploads) };
  }
}

export async function uploadImagesToCloudinary(
  userId: string,
  entries: Array<{ key: string; file: File }>,
  folder: string,
) {
  let access = await getValidCloudinaryAccess(userId);
  const results: Array<
    | { key: string; ok: true; secureUrl: string; publicId: string }
    | { key: string; ok: false; error: string }
  > = [];
  const concurrency = 6;

  for (let offset = 0; offset < entries.length; offset += concurrency) {
    const chunk = entries.slice(offset, offset + concurrency);
    try {
      const signed = await signChunk(userId, access, chunk.length, folder);
      access = signed.access;
      const chunkResults = await Promise.all(
        chunk.map(async ({ key, file }, index) => {
          try {
            const credential = signed.credentials[index];
            if (!credential) throw new Error("CLOUDINARY_UPLOAD_FAILED");
            const uploaded = await uploadImageWithSignature(credential, file);
            return { key, ok: true as const, ...uploaded };
          } catch (error) {
            return {
              key,
              ok: false as const,
              error: error instanceof Error ? error.message : "CLOUDINARY_UPLOAD_FAILED",
            };
          }
        }),
      );
      results.push(...chunkResults);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CLOUDINARY_UPLOAD_FAILED";
      results.push(...chunk.map(({ key }) => ({ key, ok: false as const, error: message })));
    }
  }

  if (results.some((result) => result.ok)) {
    usageCache.delete(`${userId}:${access.connectionId}`);
    await CloudinaryConnectionModel.updateOne(
      { _id: objectId(access.connectionId), userId },
      { $set: { lastUsedAt: new Date() } },
    ).catch(() => undefined);
  }

  return results;
}
