# Cookie Decliner

Cookie Decliner answers cookie banners with "no" for you: it clicks "reject", or turns off every optional setting and saves, so websites track you less and the pop-ups go away. It never clicks "accept", and on sites that only let you pay or accept, it hides the banner and deletes that site's cookies after you leave. It has no account, no ads and no tracking of its own, sends nothing to any server and stores only your two settings, so it stays small and out of your way.

A browser extension for Chrome and Firefox. Status: beta.

## What it does

It rejects cookie banners using the [DuckDuckGo autoconsent](https://github.com/duckduckgo/autoconsent) rules, which cover about 1,400 consent tools and sites. If a banner has no "reject all" button, the extension opens the banner's settings, turns off everything optional and saves. Before each click it reads the button text and skips buttons such as "Accept", "Agree" or "OK".

Some sites, such as bild.de, spiegel.de and heise.de, ask you to either pay or accept tracking. You can't reject these banners, so the extension hides the banner without answering it. It then deletes the site's cookies and stored data when you close the site's last tab, or 3 minutes after you leave the site. If you come back within those 3 minutes, nothing is deleted. Deleting the site's cookies and stored data means the site and its partners can't use them to recognise you on your next visit, which makes it harder to link your visits into a profile.

This deletion only touches the window or container you used: closing a site in a private window or a Firefox container leaves your normal logins alone. Sites that are still open when you quit the browser are not cleaned.

It also sends the Global Privacy Control signal (`Sec-GPC: 1`) with every request. Some US states require sites to treat this signal as an opt-out.

If no banner appears when the page loads, the extension keeps watching for one for 45 seconds.

## Privacy

The extension sends nothing anywhere and writes no logs. The only thing it saves to disk is your two settings. It keeps the list of sites waiting to be cleaned in memory, and the browser drops that list when it closes. The automated tests check for console output, outgoing requests and site names in storage.

## Install

First download this project from GitHub (**Code → Download ZIP**, then unzip it) or run `git clone`.

### Chrome

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `extension` folder.
3. Leave the folder where it is. Chrome loads the extension from it every time it starts.
4. To use the extension in incognito windows, go to **Details → Allow in Incognito**.

### Firefox

Normal Firefox only installs extensions that Mozilla has signed.

If a signed `.xpi` file is attached under [Releases](../../releases), download it, open `about:addons`, click the gear icon and choose **Install Add-on From File**.

To try the extension without a signed file, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and select `extension/manifest.json`. Firefox removes it again when it restarts.

After installing, open `about:addons` → Cookie Decliner → **Permissions** and turn on **Access your data for all websites**. The extension does nothing without it.

## Settings

Chrome: `chrome://extensions` → Details → Extension options.
Firefox: `about:addons` → Cookie Decliner → Preferences.

| Setting | Default | What it does |
|---|---|---|
| Wipe pay-or-accept sites when I leave | On | Deletes the cookies and data of "pay or accept" sites after you leave them |
| Wipe every site when I leave | Off | Does the same for every site, which logs you out everywhere |

## Permissions

| Permission | Why |
|---|---|
| Access to all websites | To find banners on every page |
| `scripting` | To call a consent tool's own "reject" function, from a fixed list in the extension |
| `declarativeNetRequestWithHostAccess` | To add the `Sec-GPC: 1` header |
| `cookies`, `browsingData` | To delete a site's cookies and data |
| `alarms` | To delete a site's data 3 minutes after you leave it |
| `storage` | To save your settings |

## Limits

- The extension does not delete cookies that advertisers set under their own domains. To stop those, block third-party cookies in your browser.
- In Firefox, a site's cache storage is not cleared.
- The extension only recognizes "pay or accept" banners made by Sourcepoint. It leaves other ones on the page and doesn't click them.
- It misses banners that appear more than 45 seconds after the page has loaded.
- Embedded videos or maps that need consent may not load.
- The rules go out of date over time. See "Updating the rules" below.

## For developers

You need a current [Node.js](https://nodejs.org) (tested with version 24). Run `npm install` once.

| Command | What it does |
|---|---|
| `npm run test:unit` | Unit tests |
| `npm run test:e2e` | Tests in Chromium with the extension loaded, on copies of real banners |
| `npm run test:firefox` | Tests in Firefox |
| `npm run test:firefox:wipe` | Tests of the cookie deletion in Firefox |
| `npm run lint:firefox` | Mozilla's extension checker |
| `sh tools/package-firefox.sh` | Builds an unsigned `dist/cookie-decliner-<version>.xpi` |

To get a signed `.xpi`, create API keys at https://addons.mozilla.org/developers/addon/api/key/ and run:

```
node tools/web-ext.mjs sign --source-dir extension --ignore-files "_metadata" "_metadata/**" --channel unlisted --api-key <issuer> --api-secret <secret> --artifacts-dir dist
```

### Updating the rules

1. Look up the newest version of `@duckduckgo/autoconsent` on npm.
2. Read what changed since the current version.
3. Run `node tools/vendor.mjs <version>`. It prints the file hashes it needs. Add them to `PINS` in `tools/vendor.mjs` and run it again.
4. Run all tests.

### Folders

```
extension/     the extension itself (this is what the browser loads)
  background/  cookie deletion
  content/     banner handling, click check, GPC
  icons/       extension icon (drawn in assets/icon.svg, rendered by tools/render-icons.mjs)
  options/     settings page
  rules/       GPC header rule
  vendor/      DuckDuckGo autoconsent (changes listed in THIRD-PARTY-NOTICES.md)
tools/         rule updates, Firefox packaging
test/          tests and test pages
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every pull request is reviewed before it is merged.

## License

Copyright (c) 2026 Cookie Decliner contributors.

Licensed under the [Mozilla Public License 2.0](LICENSE). The bundled DuckDuckGo autoconsent code is also under MPL-2.0; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
