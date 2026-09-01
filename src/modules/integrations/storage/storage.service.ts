import { isCloudinaryOAuthConfigured, isGoogleDriveOAuthConfigured } from "@/lib/env";
import {
  activateCloudinaryConnection,
  deactivateAllCloudinaryConnections,
  disconnectCloudinaryConnection,
  getCloudinaryConnectionUsage,
  listCloudinaryConnections,
  uploadImagesToCloudinary,
} from "@/modules/integrations/cloudinary/cloudinary.service";
import {
  activateGoogleDriveConnection,
  deactivateAllGoogleDriveConnections,
  disconnectGoogleDriveConnection,
  getGoogleDriveConnectionUsage,
  listGoogleDriveConnections,
  uploadImagesToGoogleDrive,
} from "@/modules/integrations/google-drive/google-drive.service";
import type {
  StorageConnectionSummary,
  StorageProviderId,
  StorageProviderSummary,
  StorageSettingsSummary,
  StorageUploadResult,
  StorageUsageSummary,
} from "./domain/types";

type ProviderConnection = Omit<StorageConnectionSummary, "id" | "provider"> & { id: string };
type StorageProviderAdapter = {
  id: StorageProviderId;
  configured: () => boolean;
  listConnections: (userId: string) => Promise<ProviderConnection[]>;
  activateConnection: (userId: string, connectionId: string) => Promise<void>;
  deactivateAll: (userId: string) => Promise<void>;
  disconnectConnection: (userId: string, connectionId: string) => Promise<{ wasActive: boolean }>;
  getConnectionUsage: (userId: string, connectionId: string) => Promise<StorageUsageSummary>;
  uploadImages: (
    userId: string,
    entries: Array<{ key: string; file: File }>,
    folder: string,
  ) => Promise<StorageUploadResult[]>;
};

const providerAdapters: Record<StorageProviderId, StorageProviderAdapter> = {
  cloudinary: {
    id: "cloudinary",
    configured: () => isCloudinaryOAuthConfigured,
    listConnections: listCloudinaryConnections,
    activateConnection: activateCloudinaryConnection,
    deactivateAll: deactivateAllCloudinaryConnections,
    disconnectConnection: disconnectCloudinaryConnection,
    getConnectionUsage: getCloudinaryConnectionUsage,
    uploadImages: uploadImagesToCloudinary,
  },
  "google-drive": {
    id: "google-drive",
    configured: () => isGoogleDriveOAuthConfigured,
    listConnections: listGoogleDriveConnections,
    activateConnection: activateGoogleDriveConnection,
    deactivateAll: deactivateAllGoogleDriveConnections,
    disconnectConnection: disconnectGoogleDriveConnection,
    getConnectionUsage: getGoogleDriveConnectionUsage,
    uploadImages: uploadImagesToGoogleDrive,
  },
};

export function storageConnectionId(provider: StorageProviderId, providerConnectionId: string) {
  return `${provider}:${providerConnectionId}`;
}

function parseStorageConnectionId(value: string) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) throw new Error("NOT_FOUND");
  const provider = value.slice(0, separator) as StorageProviderId;
  const connectionId = value.slice(separator + 1);
  const adapter = providerAdapters[provider];
  if (!adapter) throw new Error("NOT_FOUND");
  return { provider, connectionId, adapter };
}

async function listProviders(userId: string): Promise<StorageProviderSummary[]> {
  return Promise.all(
    Object.values(providerAdapters).map(async (adapter) => ({
      id: adapter.id,
      configured: adapter.configured(),
      connections: (await adapter.listConnections(userId)).map((connection) => ({
        ...connection,
        id: storageConnectionId(adapter.id, connection.id),
        provider: adapter.id,
      })),
    })),
  );
}

export async function getStorageSettings(userId: string): Promise<StorageSettingsSummary> {
  let providers = await listProviders(userId);
  let activeConnection = providers
    .flatMap((provider) => provider.connections)
    .find((connection) => connection.active);

  // Backward-compatible migration for connections created before active storage
  // existed. Keep this orchestration in the provider-neutral layer so adding a
  // Google Drive/S3 adapter cannot accidentally create two active destinations.
  if (!activeConnection) {
    const candidates = providers.flatMap((provider) => provider.connections);
    const fallback =
      candidates.find((connection) => connection.health === "connected") ?? candidates[0];
    if (fallback) {
      const { provider, connectionId, adapter } = parseStorageConnectionId(fallback.id);
      await adapter.activateConnection(userId, connectionId);
      await Promise.all(
        Object.values(providerAdapters)
          .filter((candidate) => candidate.id !== provider)
          .map((candidate) => candidate.deactivateAll(userId)),
      );
      providers = await listProviders(userId);
      activeConnection = providers
        .flatMap((providerSummary) => providerSummary.connections)
        .find((connection) => connection.active);
    }
  }

  return {
    configured: providers.some((provider) => provider.configured),
    ...(activeConnection ? { activeConnection } : {}),
    providers,
  };
}

export async function activateStorageConnection(userId: string, storageId: string) {
  const { provider, connectionId, adapter } = parseStorageConnectionId(storageId);
  const previous = (await listProviders(userId))
    .flatMap((summary) => summary.connections)
    .find((connection) => connection.active);
  try {
    // Clear other providers first so an interrupted switch never leaves two
    // destinations active. Restore the previous selection if activation fails.
    await Promise.all(
      Object.values(providerAdapters)
        .filter((candidate) => candidate.id !== provider)
        .map((candidate) => candidate.deactivateAll(userId)),
    );
    await adapter.activateConnection(userId, connectionId);
  } catch (error) {
    if (previous && previous.id !== storageId) {
      const fallback = parseStorageConnectionId(previous.id);
      await fallback.adapter.activateConnection(userId, fallback.connectionId).catch(() => undefined);
    }
    throw error;
  }
  return getStorageSettings(userId);
}

export async function disconnectStorageConnection(userId: string, storageId: string) {
  const { connectionId, adapter } = parseStorageConnectionId(storageId);
  const { wasActive } = await adapter.disconnectConnection(userId, connectionId);

  if (wasActive) {
    const providers = await listProviders(userId);
    const candidates = providers.flatMap((provider) => provider.connections);
    const fallback =
      candidates.find((connection) => connection.health === "connected") ?? candidates[0];
    if (fallback) await activateStorageConnection(userId, fallback.id);
  }

  return getStorageSettings(userId);
}

export async function getStorageConnectionUsage(userId: string, storageId: string) {
  const { connectionId, adapter } = parseStorageConnectionId(storageId);
  try {
    return await adapter.getConnectionUsage(userId, connectionId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "STORAGE_USAGE_FAILED";
    if (code === "CLOUDINARY_RECONNECT_REQUIRED" || code === "GOOGLE_DRIVE_RECONNECT_REQUIRED") {
      throw new Error("STORAGE_RECONNECT_REQUIRED");
    }
    if (code === "CLOUDINARY_NOT_CONFIGURED" || code === "GOOGLE_DRIVE_NOT_CONFIGURED") {
      throw new Error("STORAGE_NOT_CONFIGURED");
    }
    if (code === "NOT_FOUND") throw error;
    throw new Error("STORAGE_USAGE_FAILED");
  }
}

function normalizeStorageError(error: unknown) {
  const code = error instanceof Error ? error.message : "STORAGE_UPLOAD_FAILED";
  if (code === "CLOUDINARY_RECONNECT_REQUIRED") return "STORAGE_RECONNECT_REQUIRED";
  if (code === "GOOGLE_DRIVE_RECONNECT_REQUIRED") return "STORAGE_RECONNECT_REQUIRED";
  if (code === "CLOUDINARY_NOT_CONFIGURED") return "STORAGE_NOT_CONFIGURED";
  if (code === "GOOGLE_DRIVE_NOT_CONFIGURED") return "STORAGE_NOT_CONFIGURED";
  return "STORAGE_UPLOAD_FAILED";
}

export async function uploadImagesToActiveStorage(
  userId: string,
  entries: Array<{ key: string; file: File }>,
  folder: string,
): Promise<StorageUploadResult[]> {
  const settings = await getStorageSettings(userId);
  const active = settings.activeConnection;
  if (!active || active.health !== "connected") {
    throw new Error("STORAGE_RECONNECT_REQUIRED");
  }

  const adapter = providerAdapters[active.provider];
  if (!adapter?.configured()) throw new Error("STORAGE_NOT_CONFIGURED");
  const { connectionId } = parseStorageConnectionId(active.id);

  try {
    const results = await adapter.uploadImages(userId, entries, folder);
    return results.map((result) => result.ok
      ? { ...result, provider: active.provider, connectionId }
      : { ...result, error: normalizeStorageError(new Error(result.error)) });
  } catch (error) {
    throw new Error(normalizeStorageError(error));
  }
}
