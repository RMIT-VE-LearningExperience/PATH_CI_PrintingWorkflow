/**
 * migrate-composite-keys.js
 *
 * Migrates colour-level relationships from  links/{paperId}/children/{colourId}
 * to the composite-key format               links/{printerId}:{paperId}/children/{colourId}
 *
 * This ensures each printer-paper combination has its own independent set of
 * colours and steps, fixing the bug where all printers sharing a paper also
 * shared that paper's colours.
 *
 * Run from the project root (where firebase-admin is installed):
 *   node scripts/migrate-composite-keys.js
 *
 * The script is safe to re-run: it skips composite keys that already exist and
 * only deletes old paper-level links after successfully creating replacements.
 */

const admin = require("firebase-admin");

// ── Firebase init ──────────────────────────────────────────────────────────────

let app;
try {
  app = admin.app();
} catch {
  const env = process.env;
  const projectId =
    env.FIREBASE_PROJECT_ID ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    console.error(
      "ERROR: Set FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID) in your environment,\n" +
      "or place a service account JSON at scripts/service-account.json and update this script.",
    );
    process.exit(1);
  }

  // Try service account file first, fall back to application default credentials
  try {
    const sa = require("./service-account.json");
    app = admin.initializeApp({ credential: admin.credential.cert(sa) });
  } catch {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }
}

const db = admin.firestore(app);

// ── Helpers ────────────────────────────────────────────────────────────────────

const itemsCol  = (levelId)      => db.collection("items").doc(levelId).collection("items");
const linksCol  = (parentKey)    => db.collection("links").doc(parentKey).collection("children");

// ── Main ───────────────────────────────────────────────────────────────────────

async function migrate() {
  // 1. Load hierarchy
  const hierSnap = await db.collection("settings").doc("hierarchy").get();
  if (!hierSnap.exists) { console.error("No hierarchy found. Aborting."); process.exit(1); }

  const levels = (hierSnap.data().levels ?? [])
    .filter((l) => l.enabled)
    .sort((a, b) => a.order - b.order);

  if (levels.length < 2) {
    console.error(`Need at least 2 levels; found ${levels.length}. Aborting.`);
    process.exit(1);
  }

  const printerLevel = levels[0];
  const paperLevel   = levels[1];
  // For 2-level hierarchies (no colours), there is nothing to migrate at level 2
  if (levels.length < 3) {
    console.log("Only 2 levels configured — nothing to migrate at depth 2. Done.");
    return;
  }

  console.log(`Levels: ${levels.map((l) => `${l.singularName} (${l.id})`).join(" → ")}\n`);

  // 2. Load all printers
  const printerSnap = await itemsCol(printerLevel.id).get();
  console.log(`Found ${printerSnap.size} printer(s).\n`);

  // Track which paper IDs were migrated so we can clean up the old links
  const migratedPaperIds = new Set();

  for (const printerDoc of printerSnap.docs) {
    const printerId   = printerDoc.id;
    const printerName = printerDoc.data().name ?? printerId;
    console.log(`── Printer: ${printerName}`);

    // 3. Get papers linked to this printer
    const paperLinksSnap = await linksCol(printerId).get();
    if (paperLinksSnap.empty) {
      console.log("   (no papers linked)\n");
      continue;
    }

    for (const paperLinkDoc of paperLinksSnap.docs) {
      const paperId       = paperLinkDoc.id;
      const paperLinkData = paperLinkDoc.data();

      const paperDoc  = await itemsCol(paperLevel.id).doc(paperId).get();
      const paperName = paperDoc.exists ? (paperDoc.data().name ?? paperId) : paperId;
      const compositeKey = `${printerId}:${paperId}`;

      console.log(`   Paper: ${paperName}`);
      console.log(`   Composite key: links/${compositeKey}/children`);

      // 4. Check if already migrated (composite collection already has docs)
      const existingSnap = await linksCol(compositeKey).limit(1).get();
      if (!existingSnap.empty) {
        console.log("   → Already migrated, skipping.\n");
        migratedPaperIds.add(paperId);
        continue;
      }

      // 5. Get existing colours under the paper (old-style key)
      const oldLinksSnap = await linksCol(paperId).get();
      if (oldLinksSnap.empty) {
        console.log("   → No colours under paper key (nothing to copy).\n");
        migratedPaperIds.add(paperId);
        continue;
      }

      // 6. Copy each colour link to the composite key location
      let copied = 0;
      for (const colourLinkDoc of oldLinksSnap.docs) {
        const colourId   = colourLinkDoc.id;
        const colourData = colourLinkDoc.data();
        await linksCol(compositeKey).doc(colourId).set(colourData);
        copied++;
      }

      console.log(`   → Copied ${copied} colour link(s) → links/${compositeKey}/children\n`);
      migratedPaperIds.add(paperId);
    }
  }

  // 7. Delete old paper-level colour links for migrated papers
  if (migratedPaperIds.size === 0) {
    console.log("No old links to clean up.");
    return;
  }

  console.log(`\nCleaning up old links for ${migratedPaperIds.size} paper(s)…`);

  for (const paperId of migratedPaperIds) {
    const oldSnap = await linksCol(paperId).get();
    if (oldSnap.empty) continue;

    // Delete in batches of 400
    const docs = oldSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`  Deleted ${docs.length} old link(s) for paper ${paperId}`);
  }

  console.log("\n✓ Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
