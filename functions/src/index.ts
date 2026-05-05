import { initializeApp } from "firebase-admin/app";

initializeApp();

export { cleanupOrphanedImages, auditOrphanedImages } from "./cleanupOrphanedImages";
