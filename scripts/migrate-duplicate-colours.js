/**
 * migrate-duplicate-colours.js
 *
 * Phase 2 of the composite-key migration.
 *
 * After migrate-composite-keys.js re-keyed the relationship links, multiple
 * printer-paper composite keys still point to the SAME colour item documents.
 * Editing a colour from one printer therefore reflects in another.
 *
 * This script creates a unique colour item document (and unique step documents)
 * for every colour under every composite key, then updates the link to point
 * to the new ID. Original shared colour items are deleted afterwards.
 *
 * Run from the project root:
 *   node scripts/migrate-duplicate-colours.js
 *
 * Safe to re-run: already-duplicated entries are detected and skipped.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { readFileSync } = require("fs");

// ── Firebase init ──────────────────────────────────────────────────────────────

function loadCredential() {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) return cert(JSON.parse(readFileSync(credPath, "utf-8")));
  console.error("No Firebase credentials found.\nSet FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const app = initializeApp({ credential: loadCredential() });
const db  = getFirestore(app);

// ── Helpers ────────────────────────────────────────────────────────────────────

const itemsCol = (levelId)   => db.collection("items").doc(levelId).collection("items");
const linksCol = (parentKey) => db.collection("links").doc(parentKey).collection("children");
const stepsCol = (itemId)    => db.collection("steps").doc(itemId).collection("items");

// ── Main ───────────────────────────────────────────────────────────────────────

async function migrate() {
  // 1. Load hierarchy
  const hierSnap = await db.collection("settings").doc("hierarchy").get();
  if (!hierSnap.exists) { console.error("No hierarchy found. Aborting."); process.exit(1); }

  const levels = (hierSnap.data().levels ?? [])
    .filter((l) => l.enabled)
    .sort((a, b) => a.order - b.order);

  if (levels.length < 3) {
    console.log("Fewer than 3 levels — nothing to duplicate. Done.");
    return;
  }

  const printerLevel = levels[0];
  const paperLevel   = levels[1];
  const colourLevel  = levels[2];

  console.log(`Levels: ${levels.map((l) => `${l.singularName} (${l.id})`).join(" → ")}\n`);

  // 2. Find all composite keys (links whose key contains ":")
  //    They live as document IDs under the "links" collection.
  //    Firestore doesn't let us query doc IDs directly, so we enumerate via printers.
  const printerSnap = await itemsCol(printerLevel.id).get();
  const compositeKeys = [];

  for (const printerDoc of printerSnap.docs) {
    const paperLinksSnap = await linksCol(printerDoc.id).get();
    for (const paperLink of paperLinksSnap.docs) {
      compositeKeys.push(`${printerDoc.id}:${paperLink.id}`);
    }
  }

  console.log(`Found ${compositeKeys.length} composite key(s).\n`);

  // 3. Build a map: original colourId → list of composite keys that reference it
  //    Used later to identify originals that can be deleted.
  const originalColourIds = new Set();

  // 4. Process each composite key
  for (const compositeKey of compositeKeys) {
    const colourLinksSnap = await linksCol(compositeKey).get();
    if (colourLinksSnap.empty) continue;

    console.log(`── ${compositeKey}`);

    for (const linkDoc of colourLinksSnap.docs) {
      const oldColourId = linkDoc.id;
      const linkData    = linkDoc.data();

      // Skip if this link already points to a unique (already-duplicated) colour.
      // We detect this by checking whether the colour item's ID starts with a
      // composite-key marker. Since we store "_dup" in a migration flag field,
      // check for that. Otherwise fall back to checking if it was already unique.
      const existingColour = await itemsCol(colourLevel.id).doc(oldColourId).get();

      if (!existingColour.exists) {
        console.log(`   SKIP ${oldColourId} — colour item not found (already cleaned up?)`);
        continue;
      }

      if (existingColour.data()?._migrated === compositeKey) {
        console.log(`   SKIP ${oldColourId} — already duplicated for this key`);
        continue;
      }

      // Track original for later cleanup
      originalColourIds.add(oldColourId);

      // 4a. Create new colour item
      const newColourRef  = itemsCol(colourLevel.id).doc();
      const newColourId   = newColourRef.id;
      const colourData    = existingColour.data();

      await newColourRef.set({
        ...colourData,
        _migrated: compositeKey,   // marker so re-runs can skip
        lastModified: FieldValue.serverTimestamp(),
      });

      // 4b. Copy steps
      const stepsSnap = await stepsCol(oldColourId).get();
      for (const stepDoc of stepsSnap.docs) {
        await stepsCol(newColourId).doc(stepDoc.id).set(stepDoc.data());
      }

      // 4c. Update the link to point to the new colour ID (same metadata)
      await linksCol(compositeKey).doc(newColourId).set(linkData);
      await linksCol(compositeKey).doc(oldColourId).delete();

      console.log(`   ${colourData.name ?? oldColourId}  →  new id: ${newColourId}  (${stepsSnap.size} step(s) copied)`);
    }

    console.log();
  }

  // 5. Clean up original shared colour items (and their steps)
  //    Only delete if the item is no longer referenced by any composite key.
  console.log(`Checking ${originalColourIds.size} original colour(s) for cleanup…\n`);

  for (const oldColourId of originalColourIds) {
    // Check if any composite key still references this original ID
    let stillReferenced = false;
    for (const ck of compositeKeys) {
      const ref = await linksCol(ck).doc(oldColourId).get();
      if (ref.exists) { stillReferenced = true; break; }
    }

    if (stillReferenced) {
      console.log(`  KEEP ${oldColourId} — still referenced by a composite key`);
      continue;
    }

    // Delete steps
    const stepsSnap = await stepsCol(oldColourId).get();
    if (!stepsSnap.empty) {
      const batch = db.batch();
      stepsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete colour item
    await itemsCol(colourLevel.id).doc(oldColourId).delete();
    console.log(`  DELETED ${oldColourId} (${stepsSnap.size} step(s) removed)`);
  }

  console.log("\n✓ Duplication migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
