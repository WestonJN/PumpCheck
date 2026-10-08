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

## Vehicle data

`data/vehicles.json` holds South African market vehicles. Row: `["Make","Model","Variant","p or d", litres per 100 km, tank litres, status, "source URL", "note"]`.

- Status 2: fuel use and tank size were read from a published South African source (the source link is in the row and shown on the page).
- Status 1: fuel use is sourced, the tank size is approximate.
- Status 0: both figures are approximate and still need checking. About half the rows are in this state, and the page says so for each one.

No free public API exists for South African vehicle specifications. The classified sites (AutoTrader, Cars.co.za) do not offer open access, so nothing here is copied from their listings. To improve the list, replace status 0 rows with figures from the manufacturer's South African spec sheet, set status to 2 and add the source URL. For full coverage, ask a data provider such as Lightstone or TransUnion Auto for a licence.

## Search pages

`scripts/build-pages.mjs` writes about 160 static pages at deploy time: a page for each model (`/cars/toyota-hilux/`), each make, a make hub, a fuel price history page and the sitemap. Each page has its own title, description, breadcrumb and question data, and carries real costs worked out from the current prices.

After the first deploy:
1. Add your site in Google Search Console and submit `sitemap.xml`. Do the same in Bing Webmaster Tools.
2. A `.co.za` or `.com` domain ranks better than `github.io`. Set the repository variable `SITE_URL` and the Pages custom domain when you have one.
3. Ranking takes weeks and depends on competition and links. Nothing here can promise a position.

## Check locally

```
node scripts/test.mjs
python3 -m http.server 8000
```
