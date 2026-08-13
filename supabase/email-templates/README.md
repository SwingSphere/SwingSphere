# SWINGSPHERE Supabase Auth Email Templates

These templates are designed for the hosted Supabase dashboard under:

`Authentication → Emails → Templates`

## Templates and subjects

| Supabase template | Subject | File |
|---|---|---|
| Confirm sign up | `Confirm your SWINGSPHERE account` | `confirm-signup.html` |
| Reset password | `Reset your SWINGSPHERE password` | `reset-password.html` |
| Change email address | `Confirm your new SWINGSPHERE email address` | `change-email.html` |
| Reauthentication | `{{ .Token }} is your SWINGSPHERE verification code` | `reauthentication.html` |

## Supabase variables used

- Confirm sign up: `{{ .ConfirmationURL }}`
- Reset password: `{{ .ConfirmationURL }}`
- Change email address: `{{ .ConfirmationURL }}` and `{{ .NewEmail }}`
- Reauthentication: `{{ .Token }}`

## Installation

1. Open the matching template in the Supabase dashboard.
2. Replace the Subject field with the subject shown above.
3. Replace the complete Body source with the contents of the matching HTML file.
4. Use Preview to inspect the layout, but do not rely on the dashboard preview to validate remote images.
5. Save changes.
6. Send a real test email for that flow before moving to the next template. Supabase's embedded preview may block valid remote Cloudflare assets.

## Branding

- SWINGSPHERE is always one word.
- `SWING` is red (`#ef233c`).
- `SPHERE` is white on this dark background.
- The templates use Arial/Helvetica for broad email-client compatibility.
- All four templates use the hosted Cloudflare logo and portrait background.
- The outer and inner panels use an email-safe glassmorphism treatment: translucent dark surfaces, soft borders, highlights, and shadows.
- True `backdrop-filter` blur is intentionally not required because support is inconsistent across email clients.

## Hosted brand assets

Background:

`https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/b35d066b-854a-4c6e-452b-550614b06100/public`

Logo:

`https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/fb139fae-9865-4607-04d1-1ac193291f00/public`

Both URLs use Cloudflare Images' public variant. The templates also retain a near-black fallback for clients that block or omit remote background images.

## Support address

The templates currently link to:

`support@swingsphere.co`

Update all four files before installation if a different support address is chosen.

## Email delivery note

When using a third-party SMTP provider, disable click tracking for authentication emails because link rewriting can interfere with Supabase confirmation URLs.
