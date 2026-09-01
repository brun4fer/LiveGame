# Live Game

Collaborative live football analysis. A camera operator records continuously while authorised staff watch the same feed, rewind independently, return to the live edge, tag the previous 20 seconds and build personal review playlists.

## Development

1. Copy `.env.example` to `.env.local` and configure independent PostgreSQL and Cloudflare R2 resources.
2. Run `npm install`.
3. Run `npm run prisma:migrate` and `npm run prisma:seed` for a new database.
4. Run `npm run dev` and open `http://localhost:3000`.

The application is derived from the Team Analysis workflow, with the uploaded-video flow being replaced by continuous live recording and DVR-style playback.

The private R2 bucket must allow production and local browser origins to use `PUT` and `GET`, accept `Content-Type`, and expose `ETag`. Camera capture requires a secure HTTPS origin outside localhost.

## Quality checks

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
