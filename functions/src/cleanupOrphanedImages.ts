import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, CollectionReference } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { collectStoragePaths } from "./storageReferences";

// This project shares its bucket with other PATH apps. Never use the default
// database or scan/delete objects outside this app's namespace.
const DATABASE_ID = "path-ci-printingworkflows";
const STORAGE_PREFIX = "path-ci-printingworkflows/";
const BUCKET = "printer-app-531a8.firebasestorage.app";

/**
 * Automatic deletion is disabled:
 * legacy orphan records were produced against the wrong database and schema.
 * Do not trust those records, even after the audit below has been corrected.
 */
export const printingWorkflowCleanupOrphanedImages = onSchedule(
  { schedule: "0 0 * * *", timeZone: "Australia/Melbourne", timeoutSeconds: 60 },
  async () => {
    console.warn("Automatic image deletion is disabled. Review scoped audit results manually.");
  },
);

/** Read-only audit. Includes drafts, disabled levels, trash and embedded images. */
export const printingWorkflowAuditOrphanedImages = onSchedule(
  { schedule: "0 2 * * 0", timeZone: "Australia/Melbourne", timeoutSeconds: 540 },
  async () => {
    const db = getFirestore(DATABASE_ID);
    const referenced = new Set<string>();

    const visit = async (collection: CollectionReference): Promise<void> => {
      // Parent documents such as steps/{itemId} may not exist even though their
      // subcollections do. listDocuments includes these missing parent docs.
      const refs = await collection.listDocuments();
      for (const ref of refs) {
        const doc = await ref.get();
        collectStoragePaths(doc.data(), BUCKET, STORAGE_PREFIX, referenced);
        for (const child of await ref.listCollections()) await visit(child);
      }
    };

    // Finish every database read before reporting any candidate. A failed read
    // must fail the audit instead of producing an incomplete reference set.
    for (const root of ["items", "steps", "deletedItems", "settings"]) {
      await visit(db.collection(root));
    }

    const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix: STORAGE_PREFIX });
    let candidates = 0;
    for (const file of files) {
      if (!referenced.has(file.name)) {
        candidates++;
        console.log("Unreferenced image candidate (report only):", file.name);
      }
    }
    console.log(`Printing Workflow audit: ${referenced.size} referenced paths, ${candidates} candidates. No files deleted or queued.`);
  },
);
