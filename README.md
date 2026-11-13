# CH Engineering Estimates

## Latest update: Battens

1. **Upload all the files** to GitHub and commit (not the .gs files).
2. **Settings > Battens:** check the next number (set to carry on from CHIB26057), add your rates per m² (or leave blank and type prices), check the standard lines, and set your batten terms (there's a button to copy your main terms to start from).
3. **Battens** (menu): estimates (CHIB numbers), jobs, measure sheets, plans, coils on each job, and machine files.
4. **Machine files** download in exactly the same layout as your machine's CSV files, and save to Google Drive in Battens / Machine files and the job's folder.

---

## Earlier update: General estimate layout and the 3D picture

1. **Upload all the files** to GitHub and commit (not the .gs files).
2. **General estimates:** a little tighter, with the notes beside the price, so up to 8 lines, the notes and the price fit on page 1. Longer lists are shared evenly over two pages.
3. **3D picture:** no longer stretched in downloaded PDFs (General and F&T). Any space around it stays light grey, like the preview.

---

## Earlier update: Deleting, and daily backups

1. **Upload all the files** to GitHub and commit (not the .gs files).
2. **Delete an estimate:** open it, More > Delete this estimate. Or in the Estimate tracker, Select to delete, tick several, Delete selected. Numbers are never reused.
3. **Delete a sales contact:** open it, Delete this contact.
4. **Put something back:** Settings > Google and data > Recently deleted (60 days).
5. **Backups:** now daily. Settings > Google and data shows the last backup, or what went wrong if it didn't work. Click Back up now to run one straight away.

---

## Earlier update: New PDF style, Drive copies, backups

1. **Upload all the files** to GitHub and commit.
2. **PDFs:** everything except estimates, dockets, variations, workings and POs now uses the yellow cover style. Every PDF you download also saves a copy into Google Drive, in **Reports / (section)**, e.g. Reports / Fastener reports.
3. **Backups:** once a week (when an admin opens the app) a spreadsheet of everything is saved in Google Drive, in **Backups**, with a full data copy. You can also click **Back up now** in Settings > Google and data.
4. **Fastener script:** paste the new **Code-fasteners.gs** into the fastener stock app's Apps Script and Save. The reorder column is gone, and the monthly report PDF is saved to Reports / Fastener reports.

---

## Earlier update: Team, Clients, your own follow-ups, fastener emails

1. **Upload all the files** to GitHub and commit (the .gs files go in Apps Script, not GitHub).
2. **Make sure config.js has your folder ID:** `DRIVE_FOLDER_ID: "1SNzD7A4PwS6slrwomqORv5StlPQ0lk_A"`. The app also now finds the shared folder by itself if someone has shared it with you.
3. **Team** (Settings > Team): add people by Google email. The app shares the Drive folder with them. Staff can't change Settings or Pricing.
4. **Clients** (menu): save your regular builders. Pick them on new estimates and their details fill in. Each client has a folder with their jobs, detailing and totals.
5. **Your own follow-ups** (Follow-ups > + Add a follow-up): for things sent outside the app.
6. **Fastener emails:** set who gets them in Settings > Coils and fasteners. Then in the fastener stock app's Apps Script (in Davin's sheet), replace Code.gs with **Code-fasteners.gs**, Save, run **setupTriggers** once and approve, then run **testEmail** and **testMonthly** to see the new emails.

---

## Earlier update: Accept online and Variations

1. **Upload all the files** to GitHub and commit (not Code-Mitchell.gs or Code-Davin.gs, those go in Apps Script).
2. **Update your helper script (Mitchell):** paste Code-Mitchell.gs into your CH Estimates helper, Save, then **Deploy > Manage deployments > pencil > Version: New version > Deploy**. The link stays the same. If you've never deployed it as a web app, do Deploy > New deployment > Web app, Execute as Me, Who has access Anyone, and paste the link into Settings > Emails > Helper web app link.
3. **Davin:** paste Code-Davin.gs into his helper and Save (he doesn't need to deploy it).
4. Estimate emails now have an **Accept this estimate** button. When a client accepts, the job is accepted in the app, you get an email, and it shows on Needs you so you can check the deposit and email accounts.
5. Each job has a **Variations** tab: add a variation, send it to the client to approve online, and it's added to the job total.

---

## Earlier update: Health and safety, Maintenance, PDFs

1. **Upload all the files** and commit.
2. **Health and safety** (menu): Overview, Hazards, Incidents, Toolbox talks, People and training, Checks, Substances. It starts with a suggested hazard list, checks and substances; edit them to suit your site, and add your team under People and training.
3. **Maintenance** (menu): Machines, Vehicles and Service log. It starts with your roll-formers, top hat, compressor, truck, HIAB, forklift and ute. Edit each one (rego, hours or km, reminders), and enter the current hours or km so the reminders work.
4. **PDFs:** every page has a Download PDF button at the top, and incidents, toolbox talks, machines, jobs and sales contacts have their own PDF.

---

## Earlier update: Morning brief, Estimate helper, Estimated vs detailed

1. **Upload all the files** and commit.
2. **Morning brief:** pops up the first time you open the app after 9am each day. Change the time or turn it off in Settings > Estimates.
3. **Estimate helper:** in each estimate's My workings. Put in the floor area and a few basics and it suggests the metres. Check its first suggestions against your own judgement: until a few jobs have been detailed it only uses the rules in Settings > Pricing > Estimate helper rules, which you can adjust.
4. **Estimated vs detailed:** on each job's Back-costing tab, once the detailing has been read (Frames and deliveries, or Detailing > Use for the job).

---

## Earlier update: Detailing

1. **Upload the new files to GitHub** (everything in the update folder) and commit. Your `config.js` isn't included.
2. **Detailing** is in the menu between Production and Calendar. Click **+ Upload detailing**, type what it is (e.g. 6 x 6 garage), pick the job if there is one, and drop in the IFC and PDF files.
3. Each set saves in Google Drive in **CH Engineering Estimates / Detailing / (description)**, and in the job's folder under **Detailing**.
4. FRAMECAD PDFs you upload in an estimate's workings or a job's Frames and deliveries tab are added to Detailing automatically.
5. The 3D viewer needs an internet connection; the first model you open takes a few extra seconds while the viewer loads.

---

## Earlier update: Pricing and job profit

1. **Upload the new files to GitHub** and commit. Your `config.js` isn't included.
2. **Open Pricing** (in the menu) and check each machine: coil width (89mm uses 182mm, 75mm uses 166mm, 150mm uses 243mm to start with, top hat 135mm), steel $/tonne, overheads, output, labour and your margin. Everything saves as you type.
3. From then on, steel lines in an estimate are priced from Pricing: your cost per metre, with the machine margin as the markup, so it isn't marked up twice. Bought-in items still use the default markup.
4. If you change a price and open estimates were priced the old way, a yellow banner on Pricing lets you re-price them. Drafts are ticked; sent ones aren't, unless you choose to.
5. Every estimate's **My workings** tab shows **What you make on this job**, and a button to set the price to hit your target margin (set in Settings > Pricing).

---

## Earlier update: Sales

1. **Upload the new files to GitHub** (everything in the update folder) and commit. Your `config.js` isn't included.
2. **Connect it.** In the app, go to **Settings > Sales**. The sales tracker link is already filled in. Type in the **team passcode** (the same one the phone app uses) and click **Check the connection**. You don't need to change anything in the sales tracker's own script or sheet.
3. **Pick your name** in **Settings > Sales > Your name in the sales tracker** (once on each computer), so calls you log are saved under your name.
4. **Share the CH Sales Tracker sheet** with everyone's Google account as a **Viewer** (or Editor). The hub itself doesn't need this, but the morning helper reads the sheet to send each person their sales reminder.
5. **Update the morning helper.** Each person pastes the new **Code.gs** into their own helper Apps Script (keep their FOLDER_ID, SEND_HOUR and APP_LINK lines), clicks Save, then runs **setup** once and approves the new permission to read Google Sheets.

How the sales emails work: when a follow-up or review request is due for a contact who's happy to receive emails, the hub writes it from the sheet's **Email Templates** tab. **Nothing goes to a client until someone clicks Approve and send.** Waiting emails show on the Sales tab, the contact's page, the Follow-ups page and under **Needs you**, and the helper emails a reminder each morning.

---

## Earlier update: dashboard, coils, fasteners and production

Do these steps once after uploading the new files.

1. **Upload the new files to GitHub.** Drag every file from the update folder into your repository (Add file > Upload files) and commit. Your `config.js` isn't included, so your Client ID stays as it is.
2. **Turn on Google Sheets in Google Cloud.** Go to console.cloud.google.com, make sure the CH Engineering Estimates project is selected, open **APIs & Services > Library**, search for **Google Sheets API** and click **Enable**.
3. **Sign in again.** Open the app and sign in. Google will ask you to approve one new permission ("See your Google Sheets") so the dashboard can read the fastener sheet. Davin does the same next time he signs in.
4. **Update the coil tracker script.** Open the coil tracker's Apps Script, select everything in `Code.gs`, and replace it with the contents of **Code-coils.gs** from this update. Click Save. Then go to **Deploy > Manage deployments**, click the pencil, set **Version** to **New version**, and click **Deploy**. The web app link stays the same. (Nothing about your coils, PINs or labels changes. It just adds a "Coil jobs" tab for coils on jobs, and an "Active jobs" tab so the crew can pick a job when scanning.)
5. **Sign in to coils.** In the app, open **Coils** and sign in with your coil tracker name and PIN. You only do this once on each computer or phone.
6. **Set up the crew's phones.** On each phone, open `https://mitchellchengineering-stack.github.io/che-estimates/crew.html`, sign in with their name and PIN, then use **Add to Home Screen**. Your old coil tracker app still works too, because it uses the same sheet, so you can switch over whenever suits.

---

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
