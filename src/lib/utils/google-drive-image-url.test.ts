import assert from "node:assert/strict";
import test from "node:test";
import { googleDriveAssetPath, isGoogleDriveAssetUrl } from "./google-drive-image-url.ts";

const connectionId = "507f1f77bcf86cd799439011";
const fileId = "1AbCdEfGhIjKlMnOpQrStUv";

test("builds an authenticated, connection-scoped Drive asset path", () => {
  const path = googleDriveAssetPath(connectionId, fileId);
  assert.equal(path, `/api/integrations/google-drive/assets/${connectionId}/${fileId}`);
  assert.equal(isGoogleDriveAssetUrl(path), true);
});

test("rejects legacy and malformed Drive asset paths", () => {
  assert.equal(isGoogleDriveAssetUrl(`/api/integrations/google-drive/assets/${fileId}`), false);
  assert.throws(() => googleDriveAssetPath("not-an-object-id", fileId));
});
