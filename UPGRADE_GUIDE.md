# Plank Race v3: upgrade your existing live GitHub Pages website

Current site: https://masudrana1999-art.github.io/plank-race/

This is an **upgrade** to your existing GitHub Pages site and Firebase project, not a new installation. Your website can keep its current URL. You do not need a new Firebase project, paid server, Node.js installation, or `.bat` file.

## Before updating

Finish any ongoing v2 planks before upgrading. Save a backup of your current GitHub repository and the published Firebase database rules, if desired. GitHub commits allow you to restore earlier website files.

**Important:** This ZIP intentionally does **not** include `firebase-config.js`. The existing `firebase-config.js` in your GitHub repository contains your working project settings. **Leave that file in place and do not delete or replace it.** You don't need to copy or re-enter API keys.

## Step 1. Enable username/password accounts

1. Open https://console.firebase.google.com and choose `plank-race-live`.
2. Navigate to **Authentication → Sign-in method**.
3. Enable **Email/Password** and click **Save**. You do **not** need to enable **Email link (passwordless sign-in)**.
4. Keep **Anonymous** enabled. It allows the upgrade to link an existing v2 anonymous identity to a new username account, preserving that account's existing player ID and room ownership on the same browser.
5. Do not enable a paid plan or upgrade to Identity Platform just for this feature.

**How username-only login works:** Firebase Authentication's standard password provider expects an email-shaped identifier. The website silently converts a username like `masud` into the internal identifier `masud@plankrace.example`. The `.example` domain is reserved and not used to send mail. No real email address is requested or verified. Firebase Authentication manages password credentials; passwords are never stored in Realtime Database. Use only letters, numbers and underscores (3–20 characters) for usernames. Firebase passwords must be at least 6 characters. **There is no automatic forgotten-password recovery**, so save your credentials.

## Step 2. Publish the **new** database rules

1. In your Firebase project, go to **Realtime Database**. Select the existing database at `plank-race-live-default-rtdb.asia-southeast1.firebasedatabase.app`.
2. Click **Rules**.
3. Open the included **`database.rules.json`** in Notepad.
4. Copy all its text and replace the entire Rules editor contents.
5. Click **Publish**. This must happen before you switch GitHub Pages to v3.

Uploading `database.rules.json` to GitHub alone **does not publish Firebase rules**. You must publish through Firebase's database Rules tab.

The new rules preserve compatible access to old v2 room paths while adding account profiles, solo sessions, immutable completed results and individual ownership of start/stop controls.

## Step 3. Upload v3 website files to the SAME GitHub repository

1. Open https://github.com/masudrana1999-art/plank-race .
2. On the repository's main file list, use **Add file → Upload files**.
3. Extract this ZIP and open its `Plank_Race_GitHub_v3` folder. Select the website files **inside** it, not the outer folder or ZIP:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `race-core.js`
   - `history-core.js` (NEW, important)
   - `favicon.svg`
   - `.nojekyll` (optional; GitHub treats this as a hidden file)
   - `README.md` and `UPGRADE_GUIDE.md` (optional to upload)
   - `database.rules.json` (optional as a copy, but the published rules are from Step 2)
4. Do not upload the `tests` directory; it is only for development checks.
5. **Do not delete the existing `firebase-config.js` already in the repository.** It is needed, and it is intentionally missing from this ZIP.
6. Click **Commit changes**. Keep `index.html` and `history-core.js` at the repository's top level (root), alongside the working `firebase-config.js`.

Your existing **Settings → Pages → Deploy from a branch → main → /(root)** configuration does not need to be changed. Allow a few minutes for GitHub Pages to deploy. Then open your link and press Ctrl + Shift + R to bypass an old cached page.

## Step 4. First account and testing

1. Open your live site. You should see **Log in** and **Create account** instead of the old name-only entry screen.
2. Choose **Create account**, enter a username, display name and password (6+ characters). No email is requested.
3. Try **Solo plank**. Start, wait, Stop, then open **Menu → History → My planks** and confirm a record appears.
4. Go to **Dashboard → Create a race**. Copy the room link.
5. Open the room link on another device or incognito window and create a *different* username/password account.
6. Start both stopwatches independently and stop both. Both participants should see the same winner.
7. The host chooses **New round**. The previous times remain in **Menu → History → My races** for both participants, organized under the completion date.
8. Go to **Menu → Highlights** for personal best, total sessions, total time, and wins.
9. Visit **Menu → My account** to update your display name or change your password using the old password.

## Notes and limitations

- Each v3 round gets its own permanent `/rooms/ROOM/rounds/NUMBER/times/USER` records. Starting another round does not overwrite completed v3 rounds.
- Each user keeps a private index of their joined rooms and their solo times. Shared race history displays every participant's results to members who raced in that round.
- The legacy v2 system overwrote older rounds. Previously overwritten v2 results **cannot** be recovered. The latest legacy round can be shown when the account visits that older room link; earlier v2 rooms that were never indexed may not appear in a new account's History until revisited.
- If you first create your account in the **same browser** where you used v2, the app can link that existing anonymous identity to your password account so it retains its old host/player ID.
- A user's new display name affects **newly joined rooms**. It does not retroactively rename older results.
- The stopwatches display elapsed time locally from shared start timestamps. Only start and stop events are written to Firebase, so normal use produces low database traffic. Firebase's server-time offset is an estimate, not zero-latency clock synchronization.
- If the connection drops **after a start was saved**, the Stop button queues its button-press time on that device for retry after reconnection. Keep the same browser data until the stop has synchronized. No web app can guarantee recovery if someone clears browser storage or loses their device before that pending Stop is sent.
- If a host tries to reset while someone is still planking, the website asks them to wait. This is intentional to avoid interrupting someone's active time.
- Because no real email is associated with an account, there is no automated password reset. Treat forgotten passwords as unrecoverable without intervention from the Firebase project administrator.
- GitHub Pages and Firebase Spark are free **within their respective quotas**. The website does not require a laptop server after deployment.

### Troubleshooting

**"Enable Email/Password..."**: Check Firebase Authentication → Sign-in method. The older Anonymous setting is a different provider.

**"Firebase denied access"**: Paste and **Publish** the NEW `database.rules.json` in Realtime Database → Rules. Do not paste it in Cloud Firestore rules.

**"Firebase configuration is missing"**: Your existing `firebase-config.js` was removed or overwritten. Restore the working one from the previous GitHub commit.

**"auth/unauthorized-domain"**: Firebase Authentication → Settings → Authorized domains. Add the site's host, currently `masudrana1999-art.github.io`.

**Website still looks like v2**: Wait for deployment to finish in GitHub **Actions**, then hard refresh (Ctrl+Shift+R). Check that the top-level `index.html`, `app.js`, and `history-core.js` are present.

**New account created but profile save failed**: Fix database Rules, reload and log in with the same username/password to allow profile setup to finish. Do not attempt to create a second account with the same username.
