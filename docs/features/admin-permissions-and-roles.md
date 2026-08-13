# Admin Permissions and Roles

## 1) Feature Name
Admin Role Gating and Management

## 2) Purpose
Control access to admin views and provide role/badge moderation tools.

## 3) Where It Lives (files + folders)
- `components/admin/AdminPanel.tsx`
- `components/admin/AdminSidebar.tsx`
- `components/admin/AdminUserManagement.tsx`
- `components/admin/AdminUserActionsModal.tsx`
- `data/mockUsers.ts`
- `lib/api.ts` (`updateUser`, audit logging)

## 4) How It Works (technical flow)
- `AdminPanel` checks `currentUser.role` and blocks restricted views for non-admin users.
- Geo tool access is `Admin` or `import.meta.env.DEV`.
- User management UI can edit role badges and NSFW avatar flag.
- `api.updateUser` mutates in-memory user db and appends audit log entries for role/NSFW changes.

## 5) Data Dependencies
- `User.role` union (`User|Host|Admin`) in `data/mockUsers.ts`.
- Audit log dataset in `data/mockAuditLog.ts`.

## 6) UI Dependencies
- Admin sidebar nav gating.
- Header admin/account navigation based on role.

## 7) Known Edge Cases
- Role checks are purely client/mock data driven.
- Geo view is accessible in dev mode regardless of role.

## 8) Future Expansion Hooks
- Centralize authorization policy in real backend.
- Add route-guard middleware rather than view-time checks only.

## 9) Risk Areas
- Client-side role gating is bypassable without backend enforcement.
- Hardcoded role semantics can drift from future backend schema.


