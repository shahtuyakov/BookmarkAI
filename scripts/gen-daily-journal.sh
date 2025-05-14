#!/bin/bash

TODAY=$(date +"%Y-%m-%d")
TEMPLATE="docs/context/templates/DAILY_JOURNAL_TEMPLATE.md"
OUTPUT="docs/context/daily/$TODAY.md"

if [ ! -f "$OUTPUT" ]; then
  mkdir -p $(dirname "$OUTPUT")
  cp "$TEMPLATE" "$OUTPUT"
  sed -i "" "s/\[YYYY-MM-DD\]/$TODAY/g" "$OUTPUT"
  echo "Created journal for $TODAY at $OUTPUT"
else
  echo "Journal for $TODAY already exists"
fi