# Native Sprite Asset Metadata Contract

**Status:** target contract for the SolidJS Asset Library. Field-level persistence and implementation evidence are owned by COD-86 and must be finalized against the Project Model v1 Asset schema before the capability is marked complete.

## Purpose

Define the semantic metadata needed to author and reimport image and spritesheet assets without coupling the metadata model to a particular Editor panel, renderer object or file container.

The native Asset document is the source of truth. Sprite frames are typed subresources owned by the Asset and addressed through stable Project Model identities.

## Identity and source tracking

- Every imported Asset has a stable Project Model asset ID.
- A source fingerprint records the imported source revision and the import settings used to produce the current asset representation.
- A frame has a stable subresource identity while its source geometry remains semantically the same.
- Names, array positions and display labels are not identities.
- Asset paths are project-relative and resolved through the native Asset service.

## Frame geometry

A frame descriptor contains the source rectangle and original source canvas size. Trim placement records the visible region relative to the original canvas.

Authored frame properties may include:

- normalized pivot coordinates;
- trim and crop rectangles;
- rectangle, circle or polygon collision geometry;
- explicitly versioned extension properties owned by the native metadata schema.

All dimensions and coordinates are validated as finite values. Rectangles must have positive dimensions and remain within the relevant source canvas. Circles require a positive radius and must remain within bounds. Polygon geometry requires at least three finite points within the frame.

## Reimport semantics

Reimport compares the current source fingerprint and frame geometry with the last accepted import:

1. Unchanged source/frame geometry keeps stable Asset and subresource identities and authored settings.
2. A changed frame geometry produces an explicit conflict that the author can inspect and resolve.
3. A removed frame does not silently destroy authored settings; the native workflow reports the change and provides an explicit resolution path.
4. Failed import/reimport leaves the last valid Project state intact.
5. Repeated reimport of the same source revision is deterministic.

## Preview and runtime

The Editor preview uses the same Asset/Frame identities and supported geometry semantics as the Project Model and runtime adapter. Temporary decoded images, object URLs, textures, audio/video handles and other media resources have an explicit lifecycle and are released when the preview is closed, replaced or fails.

Persisted metadata does not itself guarantee that every renderer or physics backend supports every collision shape. Capability-specific runtime support must be stated and tested separately.

## Acceptance

COD-86 implementation and CODQA-10 browser/runtime acceptance use native Project/Asset/Frame fixtures and verify:

- single-file and batch import validation;
- spritesheet slicing and stable frame identities;
- pivot, trim, crop and collision metadata edit/save/reopen;
- source change, conflict resolution and rollback on failure;
- preview behavior and release of temporary resources;
- deterministic native Asset serialization and reference validation.

The current persisted Codogma metadata envelope declares `schemaVersion: 1`. Existing metadata without that exact version is rejected; older or unversioned internal snapshots are not converted. A new external Asset Pack entry without Codogma metadata may be initialized directly in the current v1 format. The exact persisted field layout is finalized in code, typed schema and fixtures together. This document defines semantic invariants and does not replace the implementation or automated tests.
