import { initializeApp } from "firebase-admin/app";

initializeApp();

export { printingWorkflowCleanupOrphanedImages, printingWorkflowAuditOrphanedImages } from "./cleanupOrphanedImages";
