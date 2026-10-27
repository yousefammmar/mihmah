# Free deployment: Render + Neon + Backblaze B2 + Brevo (code on GitHub)

**Status:** live since 2026-10-27 at **https://mihmah.onrender.com**, built from the `main` branch of the GitHub repo `yousefammmar/mihmah`.

Free-tier limits were checked on 2026-10-25. They change, so re-check the linked pages before you rely on them. None of these services needs a credit card for this setup.

| Piece | Service | Free limits that matter | Source |
|---|---|---|---|
| Code | GitHub | Public or private repo; Render deploys either | github.com |
| Server + https | Render free web service | Sleeps after **15 min** without traffic; waking takes **~1 min**. **750 instance hours**/month. **No shell, no persistent disk.** Can restart at any time. **Outbound ports 25, 465 and 587 are blocked.** | [render.com/docs/free](https://render.com/docs/free) |
| Database | Neon Free | **1 GB** storage. **100 CU-hours**/month. Suspends after **5 min** idle. **5 GB** egress. **6-hour** restore window. Hitting a limit pauses the database until next month; it never deletes data. | [neon.com/pricing](https://neon.com/pricing) |
| File storage | Backblaze B2 | **10 GB** free storage. Free egress up to 3× stored data. | [backblaze.com/cloud-storage/pricing](https://www.backblaze.com/cloud-storage/pricing) |
| Email | Brevo Free | **300 emails/day** over SMTP. Phone verification is required before anything is sent. Without your own domain, Brevo sends from `…@…brevosend.com`. | [brevo.com/free-smtp-server](https://www.brevo.com/free-smtp-server/), [help.brevo.com](https://help.brevo.com/hc/en-us/articles/14925263522578) |

Why not some alternatives:
- **Render's own database:** free Render Postgres is deleted 30 days after creation.
- **Firebase:** server code and file storage both need its paid Blaze plan.

The production server refuses to start unless it has an https `APP_URL`, PostgreSQL, S3-compatible storage, SMTP and a file-link secret (`server/config.js`). Payments stay off (`PAYMENTS_PROVIDER=none`) and demo logins stay off (`DEMO_MODE=false`).

Use nearby regions: Render **Frankfurt**, Neon **AWS Europe Central 1 (Frankfurt)**, B2 **EU Central**.

> **Keep secrets out of chats, screenshots, issues and Git.** Paste each one only into Render's Environment page. Every name in `CAPITALS` below is a Render setting. If a secret was ever shown somewhere else, rotate it (see "Rotating a secret" below).

---

## 1. Neon (database)

1. Sign up at [neon.com](https://neon.com). "Continue with GitHub" works.
2. Create a project:
   - Name: `mihmah`
   - Postgres version: 17
   - Region: **AWS Europe Central 1 (Frankfurt)**
   - Neon names the default branch **production**.
3. **Limit the compute size,** so the 100 CU-hours last about 400 awake hours a month:
   - Open **Postgres database → Computes → Edit**.
   - Set the range to **0.25 – 0.25 CU**, then Save.
4. Click **Connect**:
   - Turn **Connection pooling OFF**. The host must not contain `-pooler`, because the app's migrations hold a session lock that the pooler breaks.
   - Click **show password** and copy the string. This is **`DATABASE_URL`**.
   - The ending `?sslmode=require&channel_binding=require` works as it is. Changing it to `?sslmode=verify-full` only silences a warning in the logs.

## 2. Backblaze B2 (uploaded files)

1. Sign up at [backblaze.com](https://www.backblaze.com/sign-up/cloud-storage) and choose region **EU Central**.
2. **Buckets → Create a Bucket**:
   - Name: something unique, such as `mihmah-files`. This is **`S3_BUCKET`**.
   - Files in bucket: **Private**
   - Default encryption: **Enable**
   - Object Lock: off
3. The bucket card shows **Endpoint**, for example `s3.eu-central-003.backblazeb2.com`.
   - **`S3_ENDPOINT`** is `https://` plus that endpoint.
   - **`S3_REGION`** is the middle part, for example `eu-central-003`.
4. **Application Keys → Add a New Application Key**:
   - Name: `mihmah-render`
   - Access: **only this bucket**
   - Type: **Read and Write**
   - **keyID** (`003…`) is **`S3_ACCESS_KEY_ID`**.
   - **applicationKey** (`K003…`) is **`S3_SECRET_ACCESS_KEY`**. It is **shown only once**. If you lose it, delete the key and create a new one.

No CORS rules are needed. Uploads go through the server, and downloads are ordinary links.

## 3. Brevo (verification and password-reset email)

1. Sign up at [brevo.com](https://www.brevo.com). The onboarding asks for:
   - an organization name (`Mihmah`)
   - a website (`https://mihmah.onrender.com`)
   - a **real** postal address. Anti-spam rules require it, and a fake one can get the account suspended.

   Then pick the **Free** plan.
2. **Verify your phone** when Brevo asks (the banner on the Home page). Nothing is sent until you do.
3. **Settings ⚙ → Senders, domains, IPs → Senders → Add a sender:**
   - Name `Mihmah`, with an address you can read. Confirm it with the code Brevo emails you.
   - With a free address (Gmail etc.), Brevo shows DKIM/DMARC warnings and sends from `…brevosend.com`. Mail still arrives. Your own domain, authenticated in Brevo, fixes this later.
4. **Settings ⚙ → SMTP & API → SMTP:**
   - The **Login** shown is **`SMTP_USER`**.
   - Ignore the port it shows (587). `render.yaml` uses **2525**, which Brevo also accepts.
   - Don't turn on **"Activate for SMTP keys"** (blocking unauthorized IPs). Render's free servers have no fixed address, so it would block the site.
   - Click **Generate SMTP key**: name `mihmah-render`, variant **Standard**, the longest expiry offered. The key (`xsmtpsib-…`) is **`SMTP_PASS`**.
   - SMTP keys also expire after **90 days with no email sent**.
5. **`MAIL_FROM`** is `Mihmah <the address you confirmed>`.

## 4. GitHub (code)

The repo is `yousefammmar/mihmah`, and Render deploys its `main` branch. A private repo hides the source and commit history. Render deploys private repos too, once you grant it access.

```bash
git push origin main
```

## 5. Render (the server)

1. Sign up at [render.com](https://render.com) with **Sign in with GitHub**, and allow access to the repo.
2. Click **+ New → Blueprint** and pick the repo. Render reads `render.yaml` and creates the **mihmah** web service.
   - Don't use **New Web Service**, which ignores `render.yaml`, or **New Postgres** (deleted after 30 days).
3. Render asks for the 10 secret values. **Any you leave blank are not created,** and the deploy then fails with `Invalid configuration`. To add them later:
   - Open **mihmah** (the web service) → **Environment** → **Edit** → **+ Add Environment Variable**.
   - Don't use **Environment Groups**: a group does nothing until it's linked to the service.

   | Key | From |
   |---|---|
   | `APP_URL` | `https://mihmah.onrender.com` (exactly the URL Render shows for the service) |
   | `DATABASE_URL` | Neon, step 1 |
   | `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Backblaze, step 2 |
   | `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Brevo, step 3 |

4. Click **Save, rebuild, and deploy**. The first boot creates the database tables.
5. Open `https://mihmah.onrender.com/readyz`. You should see:

   ```json
   {"status":"ready","db":"ok","mail":"smtp","storage":"s3","payments":"none"}
   ```

## 6. First admin account (run on your Mac)

Render's free plan has no shell, so the admin is created from your computer against Neon. Run these from the project folder. The first command reads the URL without echoing it or saving it to shell history:

```bash
read -rs DATABASE_URL && export DATABASE_URL
```

```bash
ADMIN_EMAIL=you@example.com npm run admin:create
```

```bash
unset DATABASE_URL
```

The script asks for a password of 12+ characters. Use an email that isn't already registered, because the script refuses to change existing accounts. Admins can never sign up through the website.

## 7. Check it end to end

- [x] `/readyz` ready, http → https redirect, security headers, `/dev/mail` and demo login 404 (checked 2026-10-27)
- [x] A verification email arrives from the live site (Brevo over port 2525, checked 2026-10-27)
- [ ] Opening the verification link verifies the account (fixed in `8394626`; re-check after that deploy)
- [ ] "Forgot password" sends an email and the reset works
- [ ] A company verifies its email and publishes a task. The admin verifies the company.
- [ ] Upload a file in a project and download it, and **check it keeps its original name**. B2 support for the forced-filename parameter is unconfirmed.

---

## Day to day

- **Ship a change:** push to `main`. Render rebuilds and redeploys by itself, in about 2–5 minutes.
- **See what's happening:** Render → **mihmah → Logs** for the server, and **Events** for deploy history.
- **Change a setting:** **mihmah → Environment → Edit**, change the value, then **Save, rebuild, and deploy**.
- **Rotating a secret:** create a new credential, put it in Render, redeploy, then delete the old one:
  - **Neon:** Postgres database → Roles → neondb_owner → Reset password. Rebuild `DATABASE_URL` with the new password.
  - **Backblaze:** delete the app key, add a new one with the same scope, and update both `S3_ACCESS_KEY_*` values.
  - **Brevo:** SMTP & API → delete the key, generate a new one, and update `SMTP_PASS`.
- **Watch the free limits:**
  - Check Neon **Usage** weekly at first.
  - Don't add an uptime pinger. While the server is awake it queries the database every minute (offer expiry), so a pinger keeps Neon awake and burns its compute hours.
  - Accepting an offer checks expiry itself, so sleeping never lets an expired offer through.
- **Backups:** Neon Free keeps only 6 hours of history. Schedule `pg_dump` (see [DEPLOYMENT.md](DEPLOYMENT.md#backups-and-restore)) before real users depend on the site.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| "Not Found", with header `x-render-routing: no-server` | No Render service exists at that address | Create the Blueprint (step 5) |
| 502, or a long hang, with `x-render-routing: no-deploy` | The service exists but no deploy has succeeded | Open **Logs**. Usually some settings are missing. |
| `Invalid configuration: - DATABASE_URL is required …` in Logs | A secret wasn't created on the service | Add it under **mihmah → Environment** (not an Environment Group), then redeploy |
| No verification email | Phone not verified in Brevo, sender not confirmed, wrong `SMTP_USER`/`SMTP_PASS`, or an expired SMTP key | Check Brevo, then look for `mail.failed` in Logs. Generate a new key if needed. |
| "الرابط غير صالح أو انتهت صلاحيته" on a verification link | Before `8394626`, a resend cancelled earlier links and a second click failed | Fixed. Older emails sent before that deploy may still fail, so request one new link. |
| First visit takes about a minute | The free server was asleep | Expected on the free plan |
