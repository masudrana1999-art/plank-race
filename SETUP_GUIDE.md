# Plank Race: publish free on GitHub Pages + Firebase

You only do this setup once. Players joining your races will **not** need a GitHub account, a Firebase account, or an app installation.

## Accounts you need

- A **GitHub account**: https://github.com/signup
- A **Google account** (for Firebase): https://console.firebase.google.com/

Use Firebase's **Spark (no-cost)** plan. You do not need to link a billing account for this small project. These steps use a public GitHub repository, which is supported by GitHub Free. Both platforms have usage limits.

## Step 1. Create the Firebase project

1. Go to https://console.firebase.google.com/ and click **Create a project**.
2. Name it something like `plank-race-live` (the exact project ID must be unique).
3. You can disable Google Analytics because it is not required. Finish creation.
4. Confirm the project is on the **Spark** plan, not Blaze.

## Step 2. Turn on anonymous sign-in

1. In the Firebase project, open **Authentication** (in Build or Security, depending on the current Console layout).
2. Click **Get started** if necessary.
3. Open **Sign-in method**.
4. Choose **Anonymous**, switch it to **Enabled**, and click **Save**.

This lets visitors enter a name without creating an account. Anonymous identities are generated automatically and stored by the browser.

## Step 3. Create the real-time database

1. In the same Firebase project, open **Realtime Database** (under Build or Databases & Storage).
2. Select **Create Database**.
3. Select an available location near most participants, for example **asia-southeast1 (Singapore)** if offered. Location choice cannot normally be changed later.
4. Choose **Start in locked mode** when offered. Do not leave it in open Test mode.
5. After creation, open the **Rules** tab.
6. Open the included `database.rules.json` file using Notepad. Copy **all** its contents, including the outer braces.
7. Replace the Rules editor contents with this text. Click **Publish**.

**Important:** If you skip the rules, people cannot join. Do not set the database rules to unrestricted public read/write to fix a permission error.

## Step 4. Register a Web app and set the config

1. In Firebase Console click the gear icon next to Project Overview, then **Project settings**.
2. Scroll down to **Your apps** and select the **Web `</>` icon**.
3. Register an app with nickname `Plank Race Web`. **Do not enable Firebase Hosting**. You will use GitHub Pages instead.
4. Under **SDK setup and configuration**, select the **Config** view (or find the `firebaseConfig` object). It will contain values such as `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, and `appId`.
5. Open the included `firebase-config.js` file using Notepad.
6. Replace all sample placeholder values with the **actual matching Firebase config** values. Preserve `window.PLANK_FIREBASE_CONFIG = { ... };` and the quotation marks.
7. Find the exact database URL on **Realtime Database > Data**. Copy it into `databaseURL` in `firebase-config.js` (it may be `.firebaseio.com` or `.firebasedatabase.app`). Firebase's generated config might not include databaseURL if the database was created later.
8. Save `firebase-config.js` in UTF-8.

**Do not paste any service-account private key or admin SDK credential into the website.** The Firebase Web config is designed to be public. Protection comes from database rules, not hiding this config.

## Step 5. Publish on GitHub Pages

1. Log in to https://github.com and choose **+ > New repository**.
2. Set the repository name to `plank-race`. Select **Public**. You may leave **Add a README** disabled for simplicity. Click **Create repository**.
3. In the repository, select **Add file > Upload files**.
4. **Extract this ZIP first**, then drag the *files inside the `Plank_Race_GitHub` folder* into GitHub's upload area. At minimum, make sure `index.html`, `styles.css`, `firebase-config.js`, `race-core.js`, `app.js`, and `favicon.svg` are uploaded. Do not upload the ZIP as a single file. Do not nest everything under another folder.
5. Click **Commit changes**.
6. Open your repository's **Settings > Pages**.
7. Under **Build and deployment > Source** choose **Deploy from a branch**.
8. Choose branch **main**, directory **/(root)**, and click **Save**.
9. Wait for GitHub Pages to publish the site, which may take a few minutes. The website URL will appear on the Pages screen. Example: `https://YOUR-USERNAME.github.io/plank-race/`.

Check that the homepage shows **Enter the arena**, not **Almost ready**. If it shows **Almost ready**, your `firebase-config.js` still contains placeholders or Firebase is unreachable.

**Alternative config-edit method:** You may upload the files first, then open `firebase-config.js` on GitHub, click the pencil icon, paste your config, and commit. Changes can take a minute or two to redeploy.

## Step 6. Have your first race

1. Open your published GitHub Pages link in your browser.
2. Enter your name and press **Create race**.
3. Press **Copy invite link**.
4. Send that *exact* invite URL (with `?room=...`) to your friend, who enters their name and joins.
5. Each person presses **Start timer** when they begin planking and **Stop timer** when they finish. Everyone sees everyone's running and final elapsed times.
6. When two or more competitors have stopped and no one is still running, the longest finished plank wins. The person who created the race can click **New round** to reset timers for everyone.

The main site URL creates a **new room** for each person who opens it without an invite. To join the same competition, everyone else must use the **copied room link**.

## Notes and troubleshooting

- **“Firebase denied access”**: You probably did not publish `database.rules.json`, or Anonymous Authentication is still disabled.
- **“Setup needed”**: You haven't filled in `firebase-config.js` or still have a `PASTE_` or `YOUR_` placeholder.
- **“SDK unavailable”**: Your browser, firewall, or network might be blocking `www.gstatic.com`.
- **Link shows 404**: Verify `index.html` is in the repository root and **Settings > Pages** uses `main` and `/(root)`. Allow a few minutes for deployment.
- **Cannot share with someone**: Copy the invite *after* creating the race. It must contain the `?room=` code.
- **Two browser tabs appear as one competitor**: Anonymous Firebase Auth generally reuses the same identity across tabs in the same browser profile. Test with another device, a different browser profile, or an incognito window.
- **You lose access to host controls**: The host identity belongs to the original browser's anonymous Firebase credentials. Reopen the room on the same browser/profile, or create a new room if those browser credentials were cleared.
- **Internet goes down**: A stopwatch already running continues visually on your phone. Pressing Stop locally saves the click time in that browser and attempts to upload when the connection returns. Keep that tab/browser's storage intact. A new Start requires connection.
- **No one can join**: Check Firebase Realtime Database **Data** for your room, and verify the exact `databaseURL` in the config.
- **No race created by just visiting the homepage**: This is deliberate. It only creates a room when you enter a name and press **Create race**.
- **Old races**: Old small records are stored in Firebase unless you delete them manually in Realtime Database > Data. For a small friends-only app this is typically negligible. Deleting a room makes old links unusable.
- **Accuracy**: A browser captures local button presses with its monotonic clock and Firebase's estimated server-time offset. Other devices use the shared timestamps for display. Recorded elapsed time is consistent across viewers, but absolute timing can still have small clock-offset errors and is not competition-grade precision.
- **Security**: Anonymous authentication and database rules enforce that each account can only change its own stopwatch; the first participant owns the room reset. They are not anti-cheating guarantees.

## Technical overview

- `index.html`: layout
- `styles.css`: responsive design
- `app.js`: Firebase authentication, real-time updates, join, start/stop, reconnect, controls
- `race-core.js`: pure stopwatch, ranking and display logic
- `firebase-config.js`: project-specific Firebase web config
- `database.rules.json`: copy its contents to Firebase **Realtime Database > Rules**, not Firestore rules
- `.nojekyll`: disables Jekyll processing for simple GitHub Pages deployment

No Python, server, Node hosting, custom domain, Cloudflare tunnel, or paid service is required for normal use. Because this is GitHub Pages, `index.html` must be in the publishing root. This website uses Google-hosted Firebase SDK scripts, so connected devices need access to those scripts and Firebase.
