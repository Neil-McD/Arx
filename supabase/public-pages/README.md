# Public Pages (Supabase Storage)

This directory contains static web pages intended to be uploaded to the Supabase Storage bucket `public-pages`.

## Upload (manual, one-time)

1. Supabase Dashboard → Storage → open bucket `public-pages`.
2. Upload `join.html` to the bucket root.

The public URL should look like:

`https://<project_ref>.supabase.co/storage/v1/object/public/public-pages/join.html`

The invite link Edge Function (`/c/...`) will redirect here.
