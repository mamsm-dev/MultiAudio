#!/bin/sh
# Prints the CHANGELOG.md section of one version; fails if there is none.
# Usage: scripts/release-notes.sh v1.5.0
awk -v version="${1#v}" '
  /^## / { inside = ($2 == version); next }
  inside { print; if (NF) found = 1 }
  END { exit !found }
' "$(dirname "$0")/../CHANGELOG.md"
