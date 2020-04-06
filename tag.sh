#!/bin/sh
echo "export const appVersion = { gitTag : '$(git rev-parse --short HEAD)' , version : '$(node -p 'JSON.parse( require("fs").readFileSync("./package.json").toString()).version')' , compilDate : '$(date +'%d %b %Y')' } ;" > src/version.ts
echo "const appNewVersion = '$(node -p 'JSON.parse( require("fs").readFileSync("./package.json").toString()).version')' ;" > website/version.js