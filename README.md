# Plank Race v3

A static GitHub Pages web app with Firebase real-time multiplayer stopwatches, username/password login, solo workouts, date-grouped history, highlights, and account settings.

**Already running the old site?** Start with [`UPGRADE_GUIDE.md`](./UPGRADE_GUIDE.md).

## Files

- `index.html` / `styles.css`: Responsive website and sidebar.
- `app.js`: Firebase Auth, solo timers, multiplayer events, offline stop retry, and UI.
- `race-core.js`: Pure stopwatch functions.
- `history-core.js`: Date grouping, race standings, and personal record calculations.
- `database.rules.json`: Rules to publish in the Firebase Realtime Database console.
- `firebase-config.js`: **Not distributed with this upgrade. Keep your already configured version in GitHub.**
- `tests`: Development-only tests. No need to upload to GitHub.

## Updating

1. Enable Email/Password Authentication in your existing Firebase project. Leave Anonymous enabled for the v2 migration.
2. Publish the new Firebase database rules.
3. Upload updated website files to your existing GitHub repository root while **preserving the old `firebase-config.js`**.
4. Wait for GitHub Pages deployment, then hard refresh the website.

## Tests

With Node.js, run `node tests/core.test.js` and `node tests/integration.test.js`. The latter uses two simulated clients and an in-memory database, not the live Firebase cloud. Live authentication and deployed database Rules must still be confirmed with your own Firebase project.

This is a lightweight friendly competition app. Usernames are case-insensitive (`a-z`, `0-9`, `_`), passwords require at least 6 characters, and there is no email recovery because registration does not ask for a real email.
