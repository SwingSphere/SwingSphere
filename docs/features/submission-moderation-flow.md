# Submission Moderation Flow

## 1) Feature Name
Submission and Moderation Queues

## 2) Purpose
Review pending listings and flagged content through admin queues.

## 3) Where It Lives (files + folders)
- `components/admin/AdminSubmissionsQueue.tsx`
- `components/admin/AdminModerationQueue.tsx`
- `lib/api.ts` (`getPendingSubmissions`, `approveSubmission`, `deleteListing`, `dismissFlag`, `approveFlag`)
- `data/mockFlaggedContent.ts`

## 4) How It Works (technical flow)
- Submissions queue loads pending listings and supports approve/reject actions.
- Moderation queue loads flagged items and supports dismiss/edit/approve-flag actions.
- Approving a flag can cascade to `deleteListing` (content removal + audit event).

## 5) Data Dependencies
- Listing status flags (`pending_approval`, `approved`, `flagged`).
- `mockFlaggedContent` entries.

## 6) UI Dependencies
- `AdminPanel` view switch and counts in `AdminSidebar`.
- Toast notifications via `useAppStore`.

## 7) Known Edge Cases
- Moderation operations are mock/in-memory by default.
- Some flagged types (`Review`, `User`) have "edit" paths that are not fully implemented.

## 8) Future Expansion Hooks
- Add moderation reasons/taxonomy and immutable action history.
- Add bulk moderation and assignment workflows.

## 9) Risk Areas
- Deletes happen from mock API without durable transactional backend.
- Review/user moderation pathways are only partially implemented.


