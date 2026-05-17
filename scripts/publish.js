#!/usr/bin/env node
import { publish } from "../app/src/services/publish.js";
import { getDb, closeDb } from "../app/src/db/connect.js";
import { seedPresets } from "../app/src/services/themes.js";
import { seedDefaults } from "../app/src/services/settings.js";
import { seedFonts } from "../app/src/services/fonts.js";

async function main() {
  getDb();
  seedPresets();
  seedDefaults();
  seedFonts();
  const result = await publish({ logger: console });
  console.log(
    `Published: ${result.pagesWritten} pages, ${result.fontsCopied} fonts, ` +
      `${result.mediaCopied} media files, ${result.webpMade ?? 0} new webp variants.`,
  );
  closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
