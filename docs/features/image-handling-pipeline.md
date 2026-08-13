# Image Handling Pipeline

## 1) Feature Name
Listing Image Input and Display Pipeline

## 2) Purpose
Collect listing images in submission flow and render imagery across cards/pages.

## 3) Where It Lives (files + folders)
- `components/ListingSubmissionForm.tsx`
- `components/ResultCard.tsx` (consumption)
- `components/pages/EventPage.tsx` and `components/club/*` (consumption)
- `components/admin/AdminAddClub.tsx` and `components/admin/AdminAddEvent.tsx` (metadata editing only)

## 4) How It Works (technical flow)
- Submission form captures `headerImageFile` and `galleryImageFiles` from file inputs.
- Review step converts selected files into placeholder Firebase-style URL strings.
- Final submit currently logs payload + alert + navigation; no upload transport occurs.
- Admin forms mostly edit textual metadata and do not implement file upload transport.

## 5) Data Dependencies
- In-form `File`/`FileList` objects (client only).
- Mock listing fields `headerImageUrl` and `galleryImageUrls`.

## 6) UI Dependencies
- Submission wizard review panel.
- Entity hero/media rails and listing cards.

## 7) Known Edge Cases
- No backend upload means selected files are never persisted as binaries.
- URL placeholders can imply storage integration that is not actually wired.

## 8) Future Expansion Hooks
- Add real upload endpoint/storage adapter and replace placeholder URL generation.
- Add client-side validation (size, type, dimensions).

## 9) Risk Areas
- Mismatch between UI expectations and real persistence behavior.
- Potential broken images if placeholder URLs are treated as real assets.


