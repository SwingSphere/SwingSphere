# SWINGSPHERE Supabase Auth Email Templates

These files are the source-of-truth email designs for SWINGSPHERE authentication, security notifications, and account-deletion correspondence.

Hosted Supabase projects edit Auth email templates under:

`Authentication → Emails → Templates`

The hosted Dashboard does not automatically read these repository files. A template can exist here and still fall back to Supabase's default email until it is installed in the hosted project.

## Authentication templates

| Supabase template | Subject | File |
|---|---|---|
| Confirm sign up | `Confirm your SWINGSPHERE account` | `confirm-signup.html` |
| Invite user | `You're invited to SWINGSPHERE` | `invite-user.html` |
| Magic link / OTP | `Your SWINGSPHERE sign-in link` | `magic-link.html` |
| Change email address | `Confirm your new SWINGSPHERE email address` | `change-email.html` |
| Reset password | `Reset your SWINGSPHERE password` | `reset-password.html` |
| Reauthentication | `{{ .Token }} is your SWINGSPHERE verification code` | `reauthentication.html` |

## Security notification templates

These are optional Supabase project-level security notifications and should use the same visual system when enabled.

| Supabase notification | Subject | File |
|---|---|---|
| Password changed | `Your SWINGSPHERE password was changed` | `password-changed.html` |
| Email address changed | `Your SWINGSPHERE email address was changed` | `email-changed.html` |
| Phone number changed | `Your SWINGSPHERE phone number was changed` | `phone-changed.html` |
| Sign-in method linked | `A sign-in method was linked to your SWINGSPHERE account` | `identity-linked.html` |
| Sign-in method removed | `A sign-in method was removed from your SWINGSPHERE account` | `identity-unlinked.html` |
| Verification method added | `A verification method was added to your SWINGSPHERE account` | `mfa-enrolled.html` |
| Verification method removed | `A verification method was removed from your SWINGSPHERE account` | `mfa-unenrolled.html` |

## App-level account deletion templates

Account deletion is a SWINGSPHERE application workflow, not a built-in Supabase Auth email type. These templates are ready for the transactional-email delivery layer:

| Event | Subject | File |
|---|---|---|
| Deletion requested | `SWINGSPHERE account deletion requested` | `account-deletion-requested.html` |
| Deletion completed | `Your SWINGSPHERE account was deleted` | `account-deleted.html` |

Creating these files does not make account-deletion emails send automatically. The application must invoke a transactional email provider before or during the deletion lifecycle.

## Supabase variables used

- Confirm sign up: `{{ .ConfirmationURL }}`
- Invite user: `{{ .ConfirmationURL }}`
- Magic link / OTP: `{{ .ConfirmationURL }}`
- Reset password: `{{ .ConfirmationURL }}`
- Change email address: `{{ .ConfirmationURL }}` and `{{ .NewEmail }}`
- Reauthentication: `{{ .Token }}`
- Email-changed notification: `{{ .OldEmail }}`
- Phone-changed notification: `{{ .Phone }}`
- Sign-in method notifications: `{{ .Provider }}`
- Verification-method notifications: `{{ .FactorType }}`

## Hosted installation

For each hosted Supabase Auth template:

1. Open the matching template in the Supabase Dashboard.
2. Replace the Subject field with the subject shown above.
3. Replace the complete Body source with the matching HTML file.
4. Use Preview for a quick layout check, but do not rely on Dashboard preview to validate remote Cloudflare images.
5. Save the template.
6. Send a real test email for that flow before moving to the next template.

The Supabase Management API can also update hosted templates programmatically. Do not blindly run `supabase config push` against production from this repository without first auditing the entire local `supabase/config.toml`, because config push updates project configuration beyond just email-template HTML.

## Sender identity and SMTP

The visible sender should be configured as `SwingSphere` when custom SMTP is enabled. A recommended production identity is:

`SwingSphere <no-reply@auth.swingsphere.co>`

(or another verified SWINGSPHERE-owned no-reply address).

Supabase's default SMTP service displays Supabase-managed sender identity and is intended for development/testing, not public production delivery. Custom SMTP is required for a controlled sender name/address and normal public-user email delivery. Configure SPF, DKIM, and DMARC for the sending domain before launch.

### Production Resend configuration

SwingSphere's production transactional sending domain is `auth.swingsphere.co` and is configured in Resend for **sending only**. Open and click tracking should remain disabled for Auth traffic so confirmation and recovery URLs are not rewritten.

Supabase custom SMTP should use:

- Host: `smtp.resend.com`
- Port: `587` with STARTTLS (or `465` with implicit TLS if required by the client)
- Username: `resend`
- Password: a Resend sending credential/API key restricted to the SwingSphere sending domain when possible
- Sender name: `SwingSphere`
- Sender email: `no-reply@auth.swingsphere.co`

Never commit the SMTP password or Resend API key. Hosted production Auth changes should be made through the Supabase Dashboard or a narrowly scoped Management API `PATCH /v1/projects/{ref}/config/auth`; do not use a broad `supabase config push` merely to install email delivery settings or templates.

## Branding

- SWINGSPHERE is always one word in the email artwork.
- `SWING` is red (`#ef233c`).
- `SPHERE` is white on the dark background.
- Templates use Arial/Helvetica for broad email-client compatibility.
- The hosted Cloudflare SWINGSPHERE logo and portrait background are shared across the template set.
- The outer and inner panels use an email-safe glassmorphism treatment: translucent dark surfaces, restrained borders, highlights, and shadows.
- True `backdrop-filter` blur is intentionally not required because support is inconsistent across email clients.
- Authentication emails should stay focused on the requested security/account action and avoid promotional copy.

## Hosted brand assets

Background:

`https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/b35d066b-854a-4c6e-452b-550614b06100/public`

Logo:

`https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/fb139fae-9865-4607-04d1-1ac193291f00/public`

Both URLs use Cloudflare Images' public variant. Templates retain a near-black fallback for clients that block or omit remote background images.

## Support addresses

General account/security support:

`support@swingsphere.co`

Privacy/account-deletion questions:

`privacy@swingsphere.co`

## Delivery note

When using a third-party SMTP provider, disable click tracking for authentication emails because link rewriting can interfere with Supabase confirmation URLs.
