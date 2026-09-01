export const storageProviderIds = ["cloudinary", "google-drive"] as const;

export type StorageProviderId = (typeof storageProviderIds)[number];
export type StorageConnectionHealth = "connected" | "reconnect-required";

export type StorageUsageSummary = {
  usedBytes: number;
  limitBytes?: number;
  remainingBytes?: number;
  usedPercent?: number;
  updatedAt?: string;
};

export type StorageConnectionSummary = {
  id: string;
  provider: StorageProviderId;
  label: string;
  accountLabel?: string;
  resourceLabel?: string;
  active: boolean;
  health: StorageConnectionHealth;
  createdAt?: string;
  updatedAt?: string;
};

export type StorageProviderSummary = {
  id: StorageProviderId;
  configured: boolean;
  connections: StorageConnectionSummary[];
};

export type StorageSettingsSummary = {
  configured: boolean;
  activeConnection?: StorageConnectionSummary;
  providers: StorageProviderSummary[];
};

export type StorageUploadResult =
  | { key: string; ok: true; secureUrl: string; publicId: string }
  | { key: string; ok: false; error: string };
