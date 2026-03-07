# Image Zoom Retrospective (Flashcard Review)

## Goal
- Reproduce the same image expansion UX as the user's working Obsidian environment.
- Keep existing custom UI and flashcard flow intact.

## What We Learned
- The target UX is not a generic "zoom overlay"; it is the viewer behavior already present in the user's Obsidian setup.
- Multiple custom lightbox implementations caused repeated regressions:
  - blank modal
  - tiny broken image icon
  - no click response
  - scrollbar-heavy modal unlike the target UX
- "Looks close enough" is not acceptable for this feature. The target is functional parity.

## Confirmed User Environment Facts
- Excalidraw settings in the user's vault:
  - `embedType: "excalidraw"`
  - `displayExportedImageIfAvailable: false`
  - `autoexportSVG: false`
  - `autoexportPNG: false`
- Therefore, `![[Test]]` is rendered as native Excalidraw embed (not pre-exported image files).
- The "ideal" toolbar-style image viewer shown in the user's screenshots is provided by the
  `obsidian-image-toolkit` community plugin, not by Spaced Repetition itself.
- `Image Toolkit` attaches click handlers to `img` elements under:
  - `.workspace-leaf-content[data-type='markdown'] img`
  - `.workspace-leaf-content[data-type='image'] img`
  - `.community-modal-details img`
  - `.modal-content img`
- It does **not** target generic canvas/svg embeds directly.
- Excalidraw's markdown embed pipeline can generate preview `img` nodes backed by `blob:` URLs and
  revoke those object URLs after the preview image finishes loading.
- That means the image can remain visible in the review panel while `Image Toolkit` later fails to
  reopen the same `img.src` (`blob:app://... -> net::ERR_FILE_NOT_FOUND`).

## Failure Patterns
1. Overriding Obsidian's native embed rendering path in `renderers.ts`.
2. Treating Excalidraw embeds like normal `<img src>` media.
3. Using `HTMLElement`-only click assumptions (misses SVG element targets).
4. Iterating UI behavior without first locking the exact technical source of the target viewer.

## Root Cause Summary
- We repeatedly implemented "custom zoom UI" instead of "the same viewer pathway used in the reference environment".
- Excalidraw embeds are dynamic DOM/canvas/svg structures; extracting image source heuristically is fragile.
- We misattributed the target UX to Spaced Repetition when the actual viewer path came from
  `Image Toolkit` hooking normal `img` tags.
- The concrete failure for Excalidraw was revoked `blob:` image sources, not missing click handlers.

## Hard Rules For Next Implementation
1. **Do not redesign the zoom UX.** Use the same viewer pathway as the reference environment.
2. **Renderer must stay minimal.** Avoid replacing native embed output unless strictly required.
3. **Treat Excalidraw as special content type.** Do not assume `img.src` is authoritative.
4. **No broad UI changes before instrumentation.** Add targeted diagnostics first, then patch.
5. **Acceptance is screenshot parity + behavior parity**, not just "opens something".
6. **If the target UX comes from another plugin, prefer compatibility over reimplementation.**

## Required Debug Instrumentation (Temporary)
- Add trace logs for click target classification:
  - target tag name
  - closest `.internal-embed` presence
  - presence of `img/canvas/svg/background-image`
  - resolved source value (if any)
- Add trace logs for which open path was chosen:
  - native viewer path
  - fallback image path
  - fallback embed path

## Step-by-Step Plan (Next Attempt)
1. Reproduce with one deterministic fixture card (`![[Test]]`) and one normal image card.
2. Confirm whether the expected viewer is `Image Toolkit` or another plugin before changing code.
3. Keep review-panel rendering compatible with `Image Toolkit` by preserving standard `img` output
   and not intercepting image clicks.
4. If an Excalidraw preview `img` uses a `blob:` URL, cache the live blob into a stable data URL
   before Excalidraw revokes it; only use a canvas snapshot as a late fallback.
5. Keep fallback path only for cases where the primary mechanism is unavailable.
6. Remove temporary logs and keep a short permanent comment near the final routing logic.

## Verification Checklist
- Normal image click opens expected large viewer.
- Excalidraw embed click opens expected large viewer.
- No tiny broken icon modal.
- No forced scrollbar-first modal.
- Keyboard close behavior still works.
- Review buttons and flashcard grading flow unaffected.
- All tests pass (`npx jest tests/unit --runInBand`).

## Non-Goals
- Redesigning viewer controls.
- Adding new animation for zoom UI.
- Broad CSS restyling unrelated to the viewer path.

## Decision Record
- For this feature, parity with the user's reference Obsidian behavior is the product requirement.
- Future changes to zoom behavior must be evaluated against this document before implementation.
