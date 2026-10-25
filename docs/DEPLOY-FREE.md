# Free deployment: Render + Neon + Backblaze B2 + Brevo (code on GitLab)

Free-tier limits were checked on **2026-10-25**. They change; re-check the linked pages before you rely on them.
None of the five services needs a credit card for this setup.

| Piece | Service | Free limits that matter | Source |
|---|---|---|---|
| Code | GitLab | Private repositories are free. GitLab CI is not used. | gitlab.com |
| Server + https | Render free web service | Sleeps after **15 min** without traffic; waking takes **~1 min**. **750 instance hours**/month per workspace. **No shell, no persistent disk.** Can restart at any time. **Outbound ports 25, 465 and 587 are blocked.** | [render.com/docs/free](https://render.com/docs/free) |
| Database | Neon Free | **1 GB** storage per project. **100 CU-hours**/month. Suspends after **5 min** idle. **5 GB** egress. **6-hour** restore window. Permanent, no card. Hitting a limit pauses the database until next month; it never deletes data. | [neon.com/pricing](https://neon.com/pricing) |
| File storage | Backblaze B2 | **10 GB** free storage. Free egress up to 3× stored data. No card at sign-up. | [backblaze.com/cloud-storage/pricing](https://www.backblaze.com/cloud-storage/pricing) |
| Email | Brevo Free | **300 emails/day**. SMTP relay included. No card. Without your own domain, Brevo rewrites the sender to `…@…brevosend.com`. | [brevo.com/free-smtp-server](https://www.brevo.com/free-smtp-server/), [help.brevo.com](https://help.brevo.com/hc/en-us/articles/14925263522578) |

Why not Render's own database: free Render Postgres is **deleted 30 days after creation**. Neon's free plan does not expire.

The production server refuses to start unless it has an https `APP_URL`, PostgreSQL, S3-compatible storage, SMTP and a file-link secret (`server/config.js`). This stack supplies each one. Payments stay off (`PAYMENTS_PROVIDER=none`) and demo logins stay off (`DEMO_MODE=false`).

Pick nearby regions so requests don't cross continents: Render **Frankfurt**, Neon **AWS Europe Central 1 (Frankfurt)**, B2 **EU Central**.

Write each value down as you go. Every name in `CAPITALS` below is entered in Render in step 5. Treat them like passwords: don't commit them, screenshot them or paste them into chats.

---

## 1. Neon (database)

1. Sign up at [neon.com](https://neon.com).
2. Create a project:
   - Name: `mihmah`
   - Postgres version: 17
   - Region: **AWS Europe Central 1 (Frankfurt)**
3. Open **Branches → main → Computes → Edit**. Set the autoscaling **maximum to 0.25 CU**. The 100 CU-hours then last about 400 awake hours a month instead of burning faster at larger sizes.
4. Click **Connect**:
   - Turn **Connection pooling OFF**. The app's migrations hold a session lock that the pooler breaks.
   - Copy the connection string.
   - At the end, replace `sslmode=require&channel_binding=require` with `sslmode=verify-full`. The security is the same and it avoids a warning in the logs.
   - This value is **`DATABASE_URL`**.

## 2. Backblaze B2 (uploaded files)

1. Sign up at [backblaze.com](https://www.backblaze.com/sign-up/cloud-storage) and choose region **EU Central**.
2. **Buckets → Create a Bucket**:
   - Name: something unique, such as `mihmah-files-7k2p`. This is **`S3_BUCKET`**.
   - Files in bucket: **Private**
   - Default encryption: **Enable**
   - Object Lock: off
3. On the bucket card, copy **Endpoint**, for example `s3.eu-central-003.backblazeb2.com`.
   - **`S3_ENDPOINT`** is `https://` plus that endpoint.
   - **`S3_REGION`** is the middle part, for example `eu-central-003`.
4. **Application Keys → Add a New Application Key**:
   - Name: `mihmah-render`
   - Allow access to: **only this bucket**
   - Type: **Read and Write**
   - Copy **keyID** as **`S3_ACCESS_KEY_ID`**.
   - Copy **applicationKey** as **`S3_SECRET_ACCESS_KEY`**. It is shown only once.

No CORS setup is needed. Uploads go through the server, and downloads are ordinary links.

## 3. Brevo (verification and password-reset email)

1. Sign up at [brevo.com](https://www.brevo.com).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Use the name `Mihmah` and an address you can read, then confirm it from your inbox.
   - Brevo doesn't allow free addresses (Gmail, Yahoo, iCloud) as the visible sender, so it shows mail as coming from `…@…brevosend.com`. Mail still goes out.
   - A proper sender needs your own domain (paid, roughly $10/year) authenticated in Brevo (Brevo code, DKIM, DMARC). That's optional and can be done later.
3. **SMTP & API → SMTP → Generate a new SMTP key**:
   - The **Login** shown on that page (like `9a1b2c001@smtp-brevo.com`) is **`SMTP_USER`**.
   - The key is **`SMTP_PASS`**.
   - These are not your Brevo account email or password, and not an API key.
4. **`MAIL_FROM`** is `Mihmah <the address you confirmed in step 2>`.

`render.yaml` already sets `SMTP_HOST=smtp-relay.brevo.com` and **`SMTP_PORT=2525`**. Render's free tier blocks 465 and 587; Brevo documents 2525 as an alternative.

## 4. GitLab (code)

1. Sign up at [gitlab.com](https://gitlab.com).
2. **New project → Create blank project**:
   - Name: `mihmah`
   - Visibility: **Private**
   - **Untick** "Initialize repository with a README"
3. Give this Mac push access: either add your SSH key under **Preferences → SSH Keys**, or create a personal access token with the `write_repository` scope.
4. Push the deploy branch as `main`:

   ```bash
   git remote add gitlab git@gitlab.com:<your-username>/mihmah.git
   ```

   ```bash
   git push gitlab claude/mihmah-frontend-prototype-c3c9b5:main
   ```

## 5. Render (the server)

1. Sign up at [render.com](https://render.com) with **Sign in with GitLab**, which connects your repos. If you already have an account, use **Account Settings → Git Deployment Credentials → GitLab**.
2. **New → Blueprint** and pick the `mihmah` GitLab repo. Render reads `render.yaml` and asks for each secret:
   - `APP_URL`
   - `DATABASE_URL`
   - `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
   - `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
3. For **`APP_URL`**, enter `https://mihmah.onrender.com`. If Render gives the service a different address (the name is taken), set `APP_URL` in the service's **Environment** tab to the exact URL shown and redeploy. Email links and the cross-site request check both depend on it matching.
4. Click **Apply**. The first boot creates the database tables. Render generates `FILE_URL_SECRET` itself.
5. Open `https://<your-app>.onrender.com/readyz`. You should see:

   ```json
   {"status":"ready","db":"ok","mail":"smtp","storage":"s3","payments":"none"}
   ```

   If the service fails to start, the **Logs** tab names the missing or invalid setting.

## 6. First admin account (run on your Mac)

Render's free plan has no shell, so the admin is created from your computer against Neon. Run this in your own terminal from the project folder. The first command reads the database URL without echoing it or saving it to shell history:

```bash
read -rs DATABASE_URL && export DATABASE_URL
```

```bash
ADMIN_EMAIL=you@example.com npm run admin:create
```

```bash
unset DATABASE_URL
```

The script asks for a password of 12+ characters. Admins can never sign up through the website.

## 7. Check it end to end

- [ ] Register a student with a real inbox. The verification email arrives (check spam) and its link opens the live site.
- [ ] "Forgot password" sends an email and the reset works.
- [ ] A company account verifies its email and publishes a task. The admin verifies the company.
- [ ] Upload a file in a project and download it. **Check the downloaded file keeps its original name.** B2 support for the forced-filename download setting is unconfirmed.
- [ ] `https://<your-app>.onrender.com/dev/mail` returns 404, and the login page shows no demo buttons.

## Living with the free limits

- **Cold starts.** The first visit after 15 quiet minutes waits about a minute.
  - Don't add an uptime pinger to keep it awake. While the server is awake it queries the database every minute (offer expiry), so a pinger also keeps Neon awake and burns its 100 CU-hours.
  - Accepting an offer checks expiry itself, so sleeping never lets an expired offer through.
- **Neon usage.** Check **Usage** weekly for the first month. If CU-hours run out, the database pauses until the next month; no data is lost.
- **Restarts.** Render can restart the service at any time. Nothing is lost, because data lives in Neon and files in B2.
- **Backups.** Neon Free only keeps a 6-hour restore window. Once real users sign up, take regular `pg_dump` backups (see [DEPLOYMENT.md](DEPLOYMENT.md#backups-and-restore)).
- **Email cap.** 300 emails a day across verification, password resets and notifications.
- **Moving off free.** Upgrading Render removes sleeping and allows standard SMTP ports. Upgrading Neon raises compute and restore limits. Neither needs a code change.
