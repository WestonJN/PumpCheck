# Pump Check

South African petrol and diesel price calculator. Static site for GitHub Pages. No server, no tracking, no third-party requests.

## Go live

1. Create a GitHub repository (public, for example `pump-check`) and upload everything in this folder, including the `.github` and `.nojekyll` files.
2. Repository **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Open the **Actions** tab, choose **Update prices and deploy**, and press **Run workflow**. The site appears at `https://<your-username>.github.io/pump-check/`.
4. The workflow sets the site address in the page, sitemap and robots file for you.
   Using your own domain? Add a repository variable `SITE_URL` (Settings > Secrets and variables > Actions > Variables) such as `https://pumpcheck.co.za`, and add the domain under Settings > Pages.
5. Search: open Google Search Console, add your address, and submit `sitemap.xml`. Do the same in Bing Webmaster Tools.

## How prices stay current

- A daily job (05:30 SA time) reads the monthly price article, checks every number, and commits `data/prices.json`.
- The page loads that file fresh on every visit and switches to the new prices on the day they apply (first Wednesday of the month).
- The page text, title and description in `index.html` are rewritten with the new month so search engines see current prices.
- The job refuses numbers outside R10 to R80, or a jump of more than R8 from the previous month, and then fails so GitHub emails you.
- If it fails, run the workflow by hand and fill in the price boxes. That needs no code.

## Security

- Strict Content Security Policy in a meta tag: only your own scripts and styles, no inline script, no external requests.
- No third-party fonts, analytics or libraries. The page builds everything with `textContent`, never `innerHTML`, so data files cannot inject markup.
- Price data is validated in the browser before use.
- The workflow has minimal permissions and passes manual inputs through environment variables.
- GitHub Pages cannot send HTTP headers such as `X-Frame-Options` or HSTS. The page includes a frame-busting script. For full headers, put Cloudflare (free) in front of a custom domain.
- On your GitHub account: turn on two-factor sign-in, and protect `main` (Settings > Branches).

## Edit vehicles

`data/vehicles.json`, one row per vehicle: `["Make","Model","Variant","p or d", litres per 100 km, tank litres]`.
The figures are approximate manufacturer combined numbers compiled from general knowledge, not from an official database. Check them before you rely on them, and fix any that look wrong.

## Check locally

```
node scripts/test.mjs
python3 -m http.server 8000
```
