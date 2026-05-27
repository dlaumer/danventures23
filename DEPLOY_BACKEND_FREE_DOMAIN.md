# Backend Deployment With A Free Domain

This setup keeps the frontend on GitHub Pages and runs the backend on an Oracle Cloud Always Free VM:

- PostGIS runs in Docker.
- FastAPI runs in Docker.
- Caddy gives the API HTTPS.
- A free DuckDNS subdomain points to the Oracle VM.

## 1. Create A Free Subdomain

1. Go to `https://www.duckdns.org/`.
2. Sign in and create a subdomain, for example:

   ```text
   danventures-api.duckdns.org
   ```

3. Set the DuckDNS IP address to your Oracle VM public IPv4 address.

## 2. Prepare The Oracle VM

Create an Always Free Ubuntu VM in Oracle Cloud, then SSH into it:

```bash
ssh ubuntu@YOUR_ORACLE_PUBLIC_IP
```

Install Docker:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Log out and SSH back in, then check:

```bash
docker --version
docker compose version
```

## 3. Open HTTP And HTTPS On Oracle

In the Oracle Cloud console, allow inbound TCP traffic for:

```text
80
443
```

The API itself stays bound to localhost on port `8000`; public traffic goes through Caddy.

## 4. Clone The Project

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

Copy the example env file:

```bash
cp .env.example .env
nano .env
```

Use values like:

```env
POSTGRES_DB=danventures
POSTGRES_USER=dan
POSTGRES_PASSWORD=use-a-long-random-password
DATABASE_URL=postgresql+psycopg://dan:use-a-long-random-password@db:5432/danventures
API_DOMAIN=danventures-api.duckdns.org
CORS_ORIGINS=https://YOUR_USERNAME.github.io,http://localhost:5173,http://127.0.0.1:5173
VITE_API_BASE_URL=https://danventures-api.duckdns.org
```

If your GitHub Pages site is a project page, the origin is still only:

```text
https://YOUR_USERNAME.github.io
```

Do not include the repository path in `CORS_ORIGINS`.

## 5. Start The Backend

Run the production profile so Caddy starts too:

```bash
docker compose --profile production up -d --build
```

Check the containers:

```bash
docker compose ps
```

Check the API:

```bash
curl http://127.0.0.1:8000/health
curl https://danventures-api.duckdns.org/health
```

Once the database tables are loaded, this should also work:

```bash
curl https://danventures-api.duckdns.org/db-health
```

## 6. Configure The Frontend For GitHub Pages

When building the frontend for GitHub Pages, set:

```env
VITE_API_BASE_URL=https://danventures-api.duckdns.org
```

For GitHub Actions, add it as an environment variable in the workflow before `npm run build`.

For a local production build:

```bash
cd frontend
VITE_API_BASE_URL=https://danventures-api.duckdns.org npm run build
```

On PowerShell:

```powershell
cd frontend
$env:VITE_API_BASE_URL = "https://danventures-api.duckdns.org"
npm run build
```

## 7. Useful Operations

View logs:

```bash
docker compose logs -f api
docker compose logs -f caddy
docker compose logs -f db
```

Restart:

```bash
docker compose --profile production up -d --build
```

Stop:

```bash
docker compose --profile production down
```

Back up the database:

```bash
docker compose exec db pg_dump -U dan -d danventures > danventures-backup.sql
```

Restore a backup:

```bash
docker compose exec -T db psql -U dan -d danventures < danventures-backup.sql
```

## Notes

- Caddy automatically requests and renews HTTPS certificates for the DuckDNS hostname.
- DuckDNS must point to the Oracle VM public IP before Caddy can get a certificate.
- Oracle firewall/security-list rules must allow ports `80` and `443`.
- The browser will block GitHub Pages from calling an `http://` API, so use the `https://` DuckDNS URL in production.
