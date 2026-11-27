'use strict';
// Asks GitHub for the latest release and compares it with the running version.
const REPO_URL = 'https://github.com/mamsm-dev/MultiAudio';
const API_URL = 'https://api.github.com/repos/mamsm-dev/MultiAudio/releases/latest';
const RELEASES_URL = `${REPO_URL}/releases/latest`;

const parse = (version) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version))?.slice(1).map(Number);

function isNewer(latest, current) {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  const i = a.findIndex((n, k) => n !== b[k]);
  return i >= 0 && a[i] > b[i];
}

// Resolves to the new version, or null when up to date, offline or on any error.
async function checkForUpdate(current, fetch) {
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const { tag_name: tag } = await res.json();
    return isNewer(tag, current) ? tag.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

module.exports = { checkForUpdate, isNewer, REPO_URL, RELEASES_URL };
