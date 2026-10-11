# Brush assets and marketplace

## What the app actually provides

- The Windows build ships **19 bundled brush packs**. They are generated from brush-parameter data inside the app, can be previewed and installed without a network, and do not have fabricated ratings, download counts, or release dates.
- Remote browsing is optional. **No catalog URL or asset host is configured in this repository/build by default**, so online availability is truthfully shown as unavailable. No outbound request is made until a user presses **Check remote catalog** after an endpoint has been configured.
- Current pack content is JSON data only. No imported JavaScript, script hook, archive extraction, or arbitrary URL opening is supported.
- Remote catalog entries must advertise a free pack, the supported brush engine and format, a same-origin HTTPS URL, an exact byte size, and a SHA-256 digest. Downloads reject redirects, oversized responses, mismatched sizes, invalid JSON/brush data, incompatible engine versions, and digest mismatches. A failed/canceled request does not create an installed asset; the user can retry.

## Local storage and limits

`src/engine/persist.ts` upgrades the existing `carbon-studio` IndexedDB database from version 1 to version 2 by adding an `assets` object store; project/session/recent/reference/backup stores are retained. Windows-installed pack payload bytes and their metadata are stored in IndexedDB, rather than embedding the imported brush arrays in the `carbon-win-v1` localStorage record. A one-time migration copies existing imported and bundled installations into IndexedDB before localStorage pack metadata is compacted. If migration/storage fails, legacy localStorage brush arrays are kept rather than discarded.

Defaults are **100 MB per import/download** and **500 MB of installed brush packs**. The user may configure a 1–512 MB per-pack cap and a 1–4096 MB installed-pack cap in Marketplace → Storage. The 512 MB per-file hard safety limit cannot be raised. Lowering a cap never removes existing assets. The app checks installed-pack totals and, where available, preflights the browser's origin quota; IndexedDB remains authoritative and may still refuse a write. Browser-reported quota/usage includes other origin data and is not a reading of free OS disk space.

The storage screen reports exact UTF-8 JSON byte counts for the installed canonical pack and, for imports/remote packs, the size of the selected/downloaded input separately. Bundled packs are marked as local with no network download. A brush row reports its individual JSON definition byte count, not a compressed image or standalone file.

Removal requires confirmation. It removes the selected installed pack/asset record but does not rewrite project files or remove user-created custom brushes. Existing artwork strokes remain encoded in their own documents. The storage screen also exposes pack export and confirmed cleanup of unregistered/orphaned pack records.

## QR brush sharing and import

The Brush Library can encode an individual brush as a local Carbon QR payload, save that code as PNG, copy its text, or open the operating-system share chooser. A QR image may be selected for local decoding, and a camera can be started only after an explicit click/permission request. Camera tracks are stopped when the scan finishes or the modal closes. QR/image decoding never sends data to a server and never auto-opens scanned URLs; only the strict `carbon-brush-qr` v1 JSON schema is accepted.

QR text is capped at **1,800 UTF-8 bytes** for practical screen-to-screen scanning. Brushes with embedded stamp images and larger payloads must use `.carbonpack` export/import instead; the app will refuse, not silently truncate, those images. Decoded brush data goes through the ordinary brush-pack format/engine/size/duplicate validator and is persisted to the same IndexedDB asset store. The UI imports one-brush shares; the schema can contain a compact pack.

Camera access is browser/runtime-dependent and has not been platform-acceptance-tested on Windows or Android. Choosing a QR image file is the fallback path where camera access is unavailable.

## Optional remote catalog contract

Set `VITE_CARBON_ASSET_CATALOG_URL` to the real catalog URL at build time only after the catalog and pack assets have actually been hosted. Do not point it at an unrelated or user-supplied URL. The catalog and every pack must use HTTPS on the **same origin**; pack URLs may be relative to the catalog. Redirects are rejected. The environment variable is intentionally unset in this repository.

The JSON catalog format currently accepted by `src/engine/assetStore.ts` is:

```json
{
  "format": "carbon-brush-catalog",
  "version": 1,
  "packs": [
    {
      "id": "example-pack",
      "name": "Example Pack",
      "category": "Sketching",
      "version": 1,
      "description": "Short factual description.",
      "creator": "Creator name, if supplied",
      "license": "License identifier, if supplied",
      "featured": false,
      "free": true,
      "format": "carbon-brushpack",
      "engineVersion": 1,
      "url": "./packs/example-pack.carbonpack",
      "sizeBytes": 12345,
      "sha256": "<64 lowercase hexadecimal characters for the exact asset bytes>"
    }
  ]
}
```

The example is a **schema illustration only**, not a real catalog entry or hosting URL. `sizeBytes` and `sha256` must be computed from the exact UTF-8 `.carbonpack` file served at `url`; set the catalog `version` and asset `version` to the same positive integer. `featured` is a curator-supplied flag, never inferred from popularity. `free` must be explicitly `true`; paid listings are not supported. The catalog parser accepts at most 2,000 entries/2 MiB, and each pack must fit the app's hard byte limit. The pack itself is parsed and normalized by the same validator used for local imports; its name, category, and version must agree with the catalog metadata.

Example build configuration (using your actual hosted URL, not a value from this repository):

```sh
VITE_CARBON_ASSET_CATALOG_URL="$YOUR_REAL_HTTPS_CATALOG_URL" npm run build
```

Do not publish or enable a catalog until the owner has provisioned the host, checked rights/attribution for its packs, and tested the complete HTTPS download and integrity-validation workflow.

## Verification boundary

Unit tests cover byte accounting, format/version guards, same-origin HTTPS policy, required free/integrity metadata, actual progress counts, integrity failures, configurable size enforcement, and stable IDs through parse/export/reload. This is not a claim that IndexedDB migration, actual remote hosting, Windows packaging, or Android installation has been browser/device acceptance-tested.
