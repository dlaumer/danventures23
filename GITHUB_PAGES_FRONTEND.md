# GitHub Pages Frontend Deployment

Yes: the GitHub repository can be the project root, while GitHub Pages deploys only the `frontend` folder.

This repo includes a workflow at:

```text
.github/workflows/deploy-frontend.yml
```

It installs dependencies in `frontend`, runs `npm run build`, and publishes `frontend/dist` to GitHub Pages.

## 1. Create The GitHub Repo

From this project root:

```bash
git init
git add .
git commit -m "Initial Danventures app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If Git asks for authentication, use GitHub Desktop, GitHub CLI, or a personal access token.

## 2. Enable GitHub Pages

In GitHub:

1. Open the repository.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

The included workflow will deploy the frontend after every push to `main`.

## 3. Add The Backend API URL

In GitHub:

1. Go to **Settings > Secrets and variables > Actions**.
2. Open the **Variables** tab.
3. Add a repository variable:

```text
Name: VITE_API_BASE_URL
Value: https://your-free-backend-domain.duckdns.org
```

For example:

```text
https://danventures-api.duckdns.org
```

## 4. Project Pages Versus User Pages

Most repos deploy at:

```text
https://YOUR_USERNAME.github.io/YOUR_REPO/
```

The workflow automatically sets the Vite base path to:

```text
/YOUR_REPO/
```

If your repository is named exactly:

```text
YOUR_USERNAME.github.io
```

then your site deploys at the root:

```text
https://YOUR_USERNAME.github.io/
```

In that special case, add another repository variable:

```text
Name: VITE_BASE_PATH
Value: /
```

## 5. Match Backend CORS

On the backend VM, set `CORS_ORIGINS` in `.env` to the GitHub Pages origin:

```env
CORS_ORIGINS=https://YOUR_USERNAME.github.io,http://localhost:5173,http://127.0.0.1:5173
```

Do not include the repository path. CORS uses only the origin:

```text
https://YOUR_USERNAME.github.io
```

not:

```text
https://YOUR_USERNAME.github.io/YOUR_REPO/
```

Restart the backend after changing `.env`:

```bash
docker compose --profile production up -d --build
```

## 6. Check Deployment

After pushing to `main`:

1. Go to **Actions**.
2. Open **Deploy frontend to GitHub Pages**.
3. Wait for it to finish.
4. Open the Pages URL shown by the deploy job.

The frontend should call:

```text
https://your-free-backend-domain.duckdns.org
```

instead of localhost.
