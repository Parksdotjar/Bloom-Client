# Supabase Auth Email Templates

Supabase Auth email templates are configured in the Supabase dashboard, not through website frontend code.

Use `confirm-signup.html` for:

- Supabase Dashboard
- Authentication
- Emails
- Confirm signup
- Source

Recommended Auth URL settings:

- Site URL: `https://bloomclient.org`
- Redirect URLs:
  - `https://bloomclient.org/dashboard`
  - `https://bloomclient.org/login`
  - `https://bloomclient.pages.dev/dashboard`

If confirmation emails do not arrive, configure a custom SMTP sender in:

- Project Settings
- Authentication
- SMTP Settings

The built-in Supabase email sender is rate-limited and is mainly meant for development.
