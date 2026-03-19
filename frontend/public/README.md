# /public — Static Assets

Place these files here before deploying:

| File           | Size       | Description                                   |
|----------------|------------|-----------------------------------------------|
| icon.png       | 200×200    | App icon shown in Farcaster app drawer        |
| splash.png     | 200×200    | Splash screen shown while app loads           |
| og-image.png   | 1200×630   | Fallback OG image (used before API warms up)  |
| favicon.ico    | 32×32      | Browser tab icon                              |

## Notes

- `icon.png` and `splash.png` are required for Farcaster Mini App approval
- `og-image.png` is the static fallback — the backend `/api/og/daily` endpoint
  generates dynamic versions once deployed
- `splash.png` background should match `splashBackgroundColor: "#060608"` in farcaster.json

## farcaster.json (accountAssociation)

The `.well-known/farcaster.json` file needs real values from the Warpcast developer portal:
1. Go to https://warpcast.com/~/developers/mini-apps
2. Add your domain
3. Copy the header/payload/signature values into `.well-known/farcaster.json`
