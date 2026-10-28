# CH Engineering Estimates

Estimating, tracking and production app for CH Engineering Ltd. It runs on GitHub Pages (free) and keeps everything in your own Google Drive. There's no other server.

## What's in this folder

| File or folder | What it is |
| --- | --- |
| `index.html` | The app |
| The `.js` and `.css` files | The app's code and styles |
| `config.js` | The two settings you fill in during setup |
| `logo.png`, `axxis.png`, `nash.png` | Your logo plus the Axxis and NASH logos |
| `Code.gs` | The Google helper script that sends follow-ups each morning |

You can use the app straight away in "this browser only" mode once it's on GitHub (Step 1). Steps 2 to 5 connect it to Google so you and Davin share the same data, emails go out from Gmail, and dates go into Google Calendar.

---

## Step 1: Put the app on GitHub (about 10 minutes)

1. Go to github.com and sign in (or create a free account).
2. Click **New repository**. Name it `che-estimates`. Choose **Private** if you have a paid plan, otherwise **Public** is fine (there are no passwords or client data in the code; all data lives in your Google Drive). Click **Create repository**.
3. Click **uploading an existing file**, then drag in **everything inside this folder** (the `index.html` file and the `js`, `css`, `assets` and `apps-script` folders). Click **Commit changes**.
4. Go to the repository's **Settings > Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and folder **/ (root)**. Click **Save**.
5. After a minute, the page shows your link, something like `https://your-name.github.io/che-estimates/`. Open it. The app works now, saving in that browser only.

## Step 2: Create the Google connection (about 15 minutes, once only)

Do this signed in as **mitchell.chengineering@gmail.com**.

1. Go to console.cloud.google.com. Click the project picker at the top, then **New project**. Name it `CH Engineering Estimates` and click **Create**. Make sure it's selected.
2. Turn on the Google services the app uses. Go to **APIs & Services > Library** and enable each of these:
   - Google Drive API
   - Gmail API
   - Google Calendar API
3. Go to **APIs & Services > OAuth consent screen** (it may be called **Google Auth Platform**).
   - User type: **External**. App name: `CH Engineering Estimates`. Support email and developer email: your Gmail.
   - Under **Audience** (or "Test users"), add both `mitchell.chengineering@gmail.com` and `operations.chengineering@gmail.com`.
   - Leave the app in **Testing**. Only the test users can sign in, which is what you want.
4. Go to **APIs & Services > Credentials** (or **Clients**), then **Create credentials > OAuth client ID**.
   - Application type: **Web application**. Name: `Estimates app`.
   - Under **Authorised JavaScript origins**, add your GitHub address without the folder, e.g. `https://your-name.github.io`
   - Click **Create** and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## Step 3: Tell the app your Client ID

1. In your GitHub repository, open `config.js` and click the pencil icon to edit.
2. Paste the Client ID between the quotes on the `GOOGLE_CLIENT_ID` line.
3. Click **Commit changes**. Wait a minute for GitHub to update.

## Step 4: First sign-in and sharing with Davin

1. Open the app and click **Sign in with Google** as Mitchell.
2. Google will say it **hasn't verified this app**. That's expected because it's your own private app. Click **Advanced**, then **Go to CH Engineering Estimates**, and tick every permission box.
3. The app creates a folder in your Google Drive called **CH Engineering Estimates**. Inside it, the app keeps `che-app-data.json` (all your estimates and settings). Please don't edit, move or delete that file.
4. In the app, go to **Settings > Google and data** and copy the **Shared Drive folder ID**.
5. Back on GitHub, edit `config.js` again and paste it into `DRIVE_FOLDER_ID`. Commit.
6. In Google Drive, right-click the **CH Engineering Estimates** folder, choose **Share**, add `operations.chengineering@gmail.com` as an **Editor**.
7. Davin can now open the app link and sign in the same way.

## Step 5: Fill in your settings

In the app's **Settings**:

- **Pricing**: your steel cost per lineal metre for each section and gauge, labour rate, markup (1.2 to start) and minimum margin. Add the things you buy often (roller doors, PA doors, windows, flashings) with their supplier and supplier email.
- **Delivery**: your delivery sell price for each zone and floor area band, and how much your truck and trailer can carry.
- **Production**: how many jobs the factory can handle a week, and your monthly sales target.
- **Emails**: your accounts person's email (for deposit invoices in Xero), and upload a brochure if you have one. Check the email wording you're happy with.
- **Terms and conditions**: these are a sensible starting point for a light gauge steel framing manufacturer, but it's worth having a lawyer look over them before you rely on them.
- **Estimates**: the next number is already set to CHE26130. Set your current lead time here.

## Step 6: The follow-up helper (each person who sends estimates)

The app itself only runs while it's open. This small script runs inside your Google account every morning, so follow-ups go out even when nobody's at a computer. **Mitchell and Davin each do this once**, signed in as themselves, so emails come from the right Gmail.

1. Go to script.google.com and click **New project**. Name it `CH Engineering helper`.
2. Delete what's in the editor, open `Code.gs` from this folder, and paste the whole thing in.
3. At the top, fill in:
   - `FOLDER_ID`: the same folder ID from Step 4.
   - `APP_LINK`: your GitHub app link.
   - `WEEKLY_SUMMARY`: leave as `true` for Mitchell. Davin sets it to `false`, so the team only gets one Monday summary.
4. Click the gear icon (**Project Settings**) and set the time zone to **(GMT+13:00) Auckland**.
5. Back in the editor, click **+** next to **Services**, choose **Gmail API**, and click **Add**. This lets the script add your Gmail signature.
6. At the top, choose the `setup` function and click **Run**. Approve the permissions (same "Advanced > Go to…" step as before).
7. In the app, go to **Follow-ups** and choose either **Send them automatically, then tell me** or **Ask me before sending**.

What it does each morning: sends the first follow-up 1 week after an estimate is sent and the second at 2 weeks, then leaves it alone. It skips a follow-up if the client has already replied to you, sends a reminder 3 days before the pricing expires, and asks for a Google review a set number of days after a job is marked complete. If you chose "Ask me", you get an email saying what's waiting, and you approve them on the Follow-ups page.

### Optional: see when clients open your emails

Only one person needs to do this (Mitchell).

1. In the helper script, click **Deploy > New deployment**. Choose type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**. Click **Deploy** and copy the web app link.
3. In the app, go to **Settings > Emails** and paste it into **Email open tracking link**.

The tracker then shows an "Opened" tag on estimates once the client opens the email. It isn't 100% reliable because some email apps block images.

---

## Good to know

- **Signing in again**: Google sessions last about an hour. When one runs out, a **Reconnect Google** button appears at the top. One click and you're back. While the app is in Google's "Testing" mode, Google may ask you to approve it again every week or so.
- **New year**: on 1 January, numbering starts again at CHE27001 and the tracker gets a 2027 tab. 2026 stays under its own tab.
- **Where files go**: each estimate gets a folder in Drive like `2026 / CHE26130 – Cambridge Homes – 4 Oneone Street`, holding the estimate PDF, the workings PDF, plans, FRAMECAD files, photos, dockets and purchase orders.
- **FRAMECAD drawings**: the app reads the "Total Length", "Quantity" and frame names from the PDF detailing. If the drawings are also printed with the profile tag (like `89C0.75`) on each page, the app can split the metres by section and gauge automatically.
- **Backups**: Settings > Google and data has a **Download backup** button. Google Drive also keeps version history of `che-app-data.json`.
- **Practice mode**: the switch at the top makes TEST estimates that don't use real numbers or count in the stats. Handy for showing someone new how it works.
