# Plank Race 🟢

A free, real-time multiplayer plank stopwatch that can be hosted on GitHub Pages.

**Start here: [SETUP_GUIDE.md](./SETUP_GUIDE.md).**

This download is ready for GitHub Pages after you configure **Firebase Realtime Database** and **Anonymous Authentication**. Create a Firebase Spark project, publish the included `database.rules.json` in the **Realtime Database Rules** editor, then fill in `firebase-config.js` with your own Firebase Web config.

Publish these files at the GitHub repository root. In **Settings > Pages** choose **Deploy from a branch**, `main`, `/(root)`.

Each host creates a room by entering a name and gets a unique `?room=...` link. Friends use that exact link to join. They can each start and stop only their own stopwatch, watch other participants live, and see the longest completed plank. Only the host can reset for a new round. The Stop button saves a pending stop in browser storage if the connection drops.

No API server, Python, Cloudflare, credit card, or app installation is required for this setup. See the setup guide for limitations and troubleshooting.

**Local code checks (optional):** If Node.js is installed, run `node tests/core.test.js` and `node tests/integration.test.js`. Tests run with an in-memory database; a real Firebase deployment is still required for live users.
