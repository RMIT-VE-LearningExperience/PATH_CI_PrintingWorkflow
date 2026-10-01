// Usage: npm run import-content
// Phase 2: imports printers, papers, colours, steps and uploads images to Firebase Storage.
// Safe to re-run — uses set() with fixed IDs so documents are idempotent.
// Review scripts/import-content-notes.md after running for CMS action items.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { readFileSync, writeFileSync } = require("fs");
const https = require("https");

// ─── Credentials ─────────────────────────────────────────────────────────────

function loadCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const sa = JSON.parse(readFileSync(credPath, "utf-8"));
    return cert(sa);
  }
  console.error("No Firebase credentials found.");
  process.exit(1);
}

const app = initializeApp({
  credential: loadCredential(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});
const db = getFirestore(app, process.env.FIREBASE_DATABASE_ID || "(default)");
const bucket = getStorage(app).bucket();

// ─── GitHub raw URL helper ────────────────────────────────────────────────────

const GITHUB_ORG = "RMIT-VE-LearningExperience";
const P800_REPO = "CI-EpsonP800-Printing-Workflow";
const P5070_REPO = "CI-EpsonP5070-Printing-Workflow";

function rawUrl(repo, filename) {
  return `https://raw.githubusercontent.com/${GITHUB_ORG}/${repo}/main/index.hyperesources/${encodeURIComponent(filename)}`;
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function contentType(filename) {
  if (filename.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

async function uploadImage(repo, filename, storagePath) {
  const url = rawUrl(repo, filename);
  try {
    const buf = await fetchBuffer(url);
    const file = bucket.file(storagePath);
    await file.save(buf, { metadata: { contentType: contentType(filename) }, resumable: false });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  } catch (err) {
    console.warn(`    ⚠  Could not upload ${filename}: ${err.message}`);
    return "";
  }
}

// ─── Content definition ───────────────────────────────────────────────────────

const PRINTERS = [
  { id: "epson-p800",  name: "Epson SC-P800",  repo: P800_REPO,  thumbFile: "P800 - Printer.jpg" },
  { id: "epson-p5070", name: "Epson SC-P5070", repo: P5070_REPO, thumbFile: null },
];

const PAPERS = [
  { id: "canson-platine",           name: "Canson Platine",            code: "CPF", thumbFile: "Canson Platine Box image.jpg" },
  { id: "canson-rag-photographique",name: "Canson Rag Photographique", code: "CRP", thumbFile: "Canson Rag Photographique Box Image.jpg" },
  { id: "ilford-smooth-pearl",      name: "Ilford Smooth Pearl",       code: "ISP", thumbFile: "Ilford Smooth Pearl box image.jpg" },
  { id: "advanced-bw",              name: "Advanced Black & White",    code: "ABW", thumbFile: null },
];

// Colour thumbnails sourced from P800 repo; null = leave empty
const COLOURS = [
  { id: "cpf-perceptual", name: "Perceptual",         paperId: "canson-platine",            thumbFile: null,                                         thumbRepo: null      },
  { id: "cpf-relative",   name: "Relative Colorimetric", paperId: "canson-platine",         thumbFile: null,                                         thumbRepo: null      },
  { id: "crp-perceptual", name: "Perceptual",         paperId: "canson-rag-photographique", thumbFile: null,                                         thumbRepo: null      },
  { id: "crp-relative",   name: "Relative Colorimetric", paperId: "canson-rag-photographique", thumbFile: null,                                      thumbRepo: null      },
  { id: "isp-perceptual", name: "Perceptual",         paperId: "ilford-smooth-pearl",       thumbFile: null,                                         thumbRepo: null      },
  { id: "isp-relative",   name: "Relative Colorimetric", paperId: "ilford-smooth-pearl",    thumbFile: null,                                         thumbRepo: null      },
  { id: "abw-semigloss",  name: "Semi Gloss",         paperId: "advanced-bw",               thumbFile: "P800 - ABW - SemiGloss - PrinterColour.jpg", thumbRepo: P800_REPO },
  { id: "abw-matte",      name: "Matte",              paperId: "advanced-bw",               thumbFile: null,                                         thumbRepo: null      },
];

// Steps: extracted from P800 HTML + image files.
// contentHtml "" = flagged for CMS. imageFile null = text-only step.
// P5070-specific screenshots are listed in the CMS notes file.
const STEPS = {
  "cpf-perceptual": [
    { stepNum: 1, title: "Step 1 — Colour Handling", imageFile: null, contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Photoshop Manages Colors</p><p>Printer Profile: EP800pkCPF_PLP2880NCA_BPSC.icc</p><p>Rendering Intent: Perceptual</p>" },
    { stepNum: 2, title: "Step 2 — Print Quality",   imageFile: null, contentHtml: "<p>Print Settings &gt; Paper Size: A4</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 3, title: "Step 3 — Paper Settings",  imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Premium Luster</p>" },
    { stepNum: 4, title: "Step 4 — Paper Configuration", imageFile: null, contentHtml: "" },
    { stepNum: 6, title: "Step 6", imageFile: "P800 - CPF - Perceptual - Step 6.jpg", contentHtml: "" },
  ],
  "cpf-relative": [
    { stepNum: 1,  title: "Step 1 — Colour Handling",    imageFile: "P800 - CPF - Relative - Step 1 Option-01.jpg", contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Photoshop Manages Colors</p><p>Printer Profile: EP800pkCPF_PLP2880NCA_BPSN.icc</p><p>Rendering Intent: Relative Colorimetric</p>" },
    { stepNum: 2,  title: "Step 2 — Print Quality",      imageFile: null, contentHtml: "<p>Print Settings &gt; Paper Size: A4</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 3,  title: "Step 3 — Paper Settings",     imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Premium Luster</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 4,  title: "Step 4 — Paper Configuration",imageFile: null, contentHtml: "<p>Printer Options &gt; Paper Configuration</p><p>Paper Thickness: 5</p><p>Platen Gap: Wide</p><p>OK, Save then Print</p>" },
    { stepNum: 6,  title: "Step 6",  imageFile: "P800 - CPF - Relative - Step 6.jpg",  contentHtml: "" },
    { stepNum: 7,  title: "Step 7",  imageFile: "P800 - CPF - Relative - Step 7.jpg",  contentHtml: "" },
    { stepNum: 9,  title: "Step 9",  imageFile: "P800 - CPF - Relative - Step 9.jpg",  contentHtml: "" },
    { stepNum: 11, title: "Step 11", imageFile: "P800 - CPF - Relative - Step 11.jpg", contentHtml: "" },
  ],
  "crp-perceptual": [
    { stepNum: 1, title: "Step 1 — Colour Handling",     imageFile: null, contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Photoshop Manages Colors</p><p>Printer Profile: EP800mkCRP_AMP2880NCA_BPSC.icc</p><p>Rendering Intent: Perceptual</p>" },
    { stepNum: 2, title: "Step 2 — Print Quality",       imageFile: null, contentHtml: "<p>Print Settings &gt; Paper Size: A4</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 3, title: "Step 3 — Paper Settings",      imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Archival Matte</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 4, title: "Step 4 — Paper Configuration", imageFile: null, contentHtml: "" },
    { stepNum: 6, title: "Step 6", imageFile: "P800 - CRP - Perceptual - Step 6.jpg",  contentHtml: "" },
    { stepNum: 8, title: "Step 8", imageFile: "P800 - CRP - Perceptual - Step 8.jpg",  contentHtml: "" },
    { stepNum: 9, title: "Step 9", imageFile: "P800 - CRP - Perceptual - Step 9.jpg",  contentHtml: "" },
  ],
  "crp-relative": [
    { stepNum: 1, title: "Step 1 — Colour Handling",     imageFile: null, contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Photoshop Manages Colors</p><p>Printer Profile: EP800mkCRP_AMP2880NCA_BPSN.icc</p><p>Rendering Intent: Relative Colorimetric</p>" },
    { stepNum: 2, title: "Step 2 — Print Quality",       imageFile: null, contentHtml: "<p>Print Settings &gt; Paper Size: A4</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 3, title: "Step 3 — Paper Settings",      imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Archival Matte</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 4, title: "Step 4 — Paper Configuration", imageFile: null, contentHtml: "<p>Printer Options &gt; Paper Configuration</p><p>Paper Thickness: 5</p><p>Platen Gap: Wide</p><p>OK, Save then Print</p>" },
    { stepNum: 6, title: "Step 6", imageFile: "P800 - CRP - Relative - Step 6.jpg",    contentHtml: "" },
    { stepNum: 9, title: "Step 9", imageFile: "P800 - CRP - Relative - Step 9.jpg",    contentHtml: "" },
  ],
  "isp-perceptual": [
    { stepNum: 1, title: "Step 1 — Colour Handling",     imageFile: null, contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Photoshop Manages Colors</p><p>Printer Profile: EP800pkISP_PLP2880NCA_BPSC.icc</p><p>Rendering Intent: Perceptual</p>" },
    { stepNum: 2, title: "Step 2 — Print Quality",       imageFile: null, contentHtml: "<p>Print Settings &gt; Paper Size: A4</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 3, title: "Step 3 — Paper Settings",      imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Premium Luster</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 4, title: "Step 4 — Paper Configuration", imageFile: null, contentHtml: "" },
    { stepNum: 6, title: "Step 6", imageFile: "P800 - ISP - Perceptual - Step 6.jpg",  contentHtml: "" },
    { stepNum: 8, title: "Step 8", imageFile: "P800 - ISP - Perceptual - Step 8.jpg",  contentHtml: "" },
  ],
  "isp-relative": [
    { stepNum: 1, title: "Step 1 — Colour Handling",     imageFile: null, contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Photoshop Manages Colors</p><p>Printer Profile: EP800pkISP_PLP2880NCA_BPSN.icc</p><p>Rendering Intent: Relative Colorimetric</p>" },
    { stepNum: 2, title: "Step 2 — Print Quality",       imageFile: null, contentHtml: "<p>Print Settings &gt; Paper Size: A4</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 3, title: "Step 3 — Paper Settings",      imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Premium Luster</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 4, title: "Step 4 — Paper Configuration", imageFile: null, contentHtml: "<p>Printer Options &gt; Paper Configuration</p><p>Paper Thickness: 5</p><p>Platen Gap: Wide</p><p>OK, Save then Print</p>" },
    { stepNum: 6, title: "Step 6", imageFile: "P800 - ISP - Relative - Step 6.jpg",    contentHtml: "" },
    { stepNum: 8, title: "Step 8", imageFile: "P800 - ISP - Relative - Step 8.jpg",    contentHtml: "" },
  ],
  "abw-semigloss": [
    { stepNum: 1, title: "Step 1 — Colour Handling",  imageFile: "P800 - ABW - SemiGloss - Step 1.jpg", contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Printer Manages Colors</p><p>Rendering Intent: Relative Colorimetric</p>" },
    { stepNum: 2, title: "Step 2 — Colour Matching",  imageFile: null, contentHtml: "<p>Printer Options &gt; Colour Matching</p><p>EPSON Color Controls</p>" },
    { stepNum: 3, title: "Step 3 — Print Settings",   imageFile: null, contentHtml: "<p>Printer Options &gt; Colour Matching: EPSON Color Controls</p><p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Premium Luster</p><p>Color: Advanced B&amp;W Photo</p><p>Color Toning: Neutral</p><p>Print Quality: SuperPhoto - 2880dpi</p>" },
    { stepNum: 4, title: "Step 4 — Save and Print",   imageFile: "P800 - ABW - SemiGloss - Step 4.jpg", contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Premium Luster</p><p>Color: Advanced B&amp;W Photo</p><p>Color Toning: Neutral</p><p>Print Quality: SuperPhoto - 2880dpi</p>" },
    { stepNum: 5, title: "Step 5",                    imageFile: null, contentHtml: "" },
  ],
  "abw-matte": [
    { stepNum: 1, title: "Step 1 — Colour Handling",  imageFile: null, contentHtml: "<p>Printer: EPSON SC-P800 Series</p><p>Color Handling: Printer Manages Colors</p><p>Rendering Intent: Relative Colorimetric</p>" },
    { stepNum: 2, title: "Step 2 — Colour Matching",  imageFile: null, contentHtml: "<p>Printer Options &gt; Colour Matching</p><p>EPSON Color Controls</p>" },
    { stepNum: 3, title: "Step 3 — Print Settings",   imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Archival Matte</p><p>Color: Advanced B&amp;W Photo</p><p>Color Toning: Neutral</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 4, title: "Step 4 — Save and Print",   imageFile: null, contentHtml: "<p>Printer Options &gt; Print Settings</p><p>Paper Source: Front Fine Art</p><p>Media Type: Epson Archival Matte</p><p>Color: Advanced B&amp;W Photo</p><p>Color Toning: Neutral</p><p>Print Quality: SuperPhoto - 2880dpi</p><p>✓ High Speed</p>" },
    { stepNum: 5, title: "Step 5",                    imageFile: null, contentHtml: "" },
  ],
};

// P5070-specific screenshots to note for CMS addition
const P5070_CMS_NOTES = [
  { colour: "cpf-perceptual",  files: ["P5070 - CPF - Perceptual - Step 5.jpg", "P5070 - CPF - Perceptual - Step 6.1.png", "P5070 - CPF - Perceptual - Step 7.jpg", "P5070 - CPF - Perceptual - Step 8.jpg", "P5070 - CPF - Perceptual - Step 9.1.png"] },
  { colour: "cpf-relative",    files: ["P5070 - CPF - Relative - Step 5.jpg", "P5070 - CPF - Relative - Step 7.jpg"] },
  { colour: "crp-perceptual",  files: ["P5070 - CRP - Perceptual - Step 5.jpg", "P5070 - CRP - Perceptual - Step 7.jpg", "P5070 - CRP - Perceptual - Step 9.1.png"] },
  { colour: "crp-relative",    files: ["P5070 - CRP - Relative - Step 5.jpg", "P5070 - CRP - Relative - Step 7.jpg"] },
  { colour: "isp-perceptual",  files: ["P5070 - ISP - Perceptual - Step 5.jpg", "P5070 - ISP - Perceptual - Step 7.jpg"] },
  { colour: "isp-relative",    files: ["P5070 - ISP - Relative - Step 5.jpg", "P5070 - ISP - Relative - Step 7.jpg"] },
  { colour: "abw-semigloss",   files: ["P5070 - ABW - SemiGloss Step 1.jpg", "P5070 - ABW - SemiGloss Step 4.jpg", "P5070 - ABW - SemiGloss Step 5.1.png", "P5070 - ABW - SemiGloss Step 6.1.png", "P5070 - ABW - SemiGloss Step 7.1.png", "P5070 - ABW - SemiGloss Step 7.2 - Color matching.png", "P5070 - ABW - SemiGloss Step 8.1 - Print settings - semigloss.png"] },
  { colour: "abw-matte",       files: ["P5070 - ABW - Matte - Step 8.1 - Print settings Matte.png"] },
];

// Sub-steps and Option variants skipped from P800
const SKIPPED_P800 = [
  "P800 - ABW - Matte - Step 9.1 - Print settingspng.png",
  "P800 - ABW - SemiGloss - Step 8.1 - Colour Matching.png",
  "P800 - ABW - SemiGloss - Step 9.1 - Print settings.png",
  "P800 - CPF - Relative - Step 1 Option-02.jpg",
  "P800 - CPF - Relative - Step 7.1.png",
  "P800 - CPF - Relative - Step 9.1.png",
  "P800 - CPF - Relative - Step 11.1.png",
  "P800 - CRP - Perceptual - Step 10.1.jpg",
  "P800 - CRP - Perceptual - Step 11.1.jpg",
];

// ─── Firestore helpers ────────────────────────────────────────────────────────

const NOW = new Date();

function itemsCol(levelId) {
  return db.collection("items").doc(levelId).collection("items");
}
function childrenCol(parentItemId) {
  return db.collection("links").doc(parentItemId).collection("children");
}
function stepsCol(parentItemId) {
  return db.collection("steps").doc(parentItemId).collection("items");
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n=== Phase 2: Content Import ===\n");

  // ── 1. Printers ──────────────────────────────────────────────────────────
  console.log("1. Uploading printer thumbnails and creating printer items...");
  for (const p of PRINTERS) {
    let thumbnailUrl = "";
    if (p.thumbFile) {
      process.stdout.write(`   Uploading ${p.thumbFile}... `);
      thumbnailUrl = await uploadImage(p.repo, p.thumbFile, `level_1/${p.id}/thumbnail`);
      console.log(thumbnailUrl ? "✓" : "⚠ skipped");
    }
    await itemsCol("level_1").doc(p.id).set({
      name: p.name,
      description: "",
      thumbnailUrl,
      slug: slug(p.name),
      published: false,
      createdAt: NOW,
      lastModified: NOW,
      modifiedBy: "import-script",
    });
    console.log(`   ✓ Printer: ${p.name}`);
  }

  // ── 2. Papers ─────────────────────────────────────────────────────────────
  console.log("\n2. Uploading paper thumbnails and creating paper items...");
  for (const paper of PAPERS) {
    let thumbnailUrl = "";
    if (paper.thumbFile) {
      process.stdout.write(`   Uploading ${paper.thumbFile}... `);
      thumbnailUrl = await uploadImage(P800_REPO, paper.thumbFile, `level_2/${paper.id}/thumbnail`);
      console.log(thumbnailUrl ? "✓" : "⚠ skipped");
    }
    await itemsCol("level_2").doc(paper.id).set({
      name: paper.name,
      description: "",
      thumbnailUrl,
      slug: slug(paper.name),
      published: false,
      createdAt: NOW,
      lastModified: NOW,
      modifiedBy: "import-script",
    });
    console.log(`   ✓ Paper: ${paper.name}`);
  }

  // ── 3. Colours ────────────────────────────────────────────────────────────
  console.log("\n3. Uploading colour thumbnails and creating colour items...");
  for (const colour of COLOURS) {
    let thumbnailUrl = "";
    if (colour.thumbFile && colour.thumbRepo) {
      process.stdout.write(`   Uploading ${colour.thumbFile}... `);
      thumbnailUrl = await uploadImage(colour.thumbRepo, colour.thumbFile, `level_3/${colour.id}/thumbnail`);
      console.log(thumbnailUrl ? "✓" : "⚠ skipped");
    }
    await itemsCol("level_3").doc(colour.id).set({
      name: colour.name,
      description: "",
      thumbnailUrl,
      slug: slug(colour.name + "-" + colour.id),
      published: false,
      createdAt: NOW,
      lastModified: NOW,
      modifiedBy: "import-script",
    });
    console.log(`   ✓ Colour: ${colour.name} (${colour.id})`);
  }

  // ── 4. Links: Printers → Papers ──────────────────────────────────────────
  console.log("\n4. Linking printers to papers...");
  for (const printer of PRINTERS) {
    for (let i = 0; i < PAPERS.length; i++) {
      const paper = PAPERS[i];
      await childrenCol(printer.id).doc(paper.id).set({
        childLevelId: "level_2",
        published: false,
        order: i,
      });
    }
    console.log(`   ✓ ${printer.name} → all 4 papers`);
  }

  // ── 5. Links: Papers → Colours ───────────────────────────────────────────
  console.log("\n5. Linking papers to colours...");
  const paperColourMap = {};
  for (const colour of COLOURS) {
    if (!paperColourMap[colour.paperId]) paperColourMap[colour.paperId] = [];
    paperColourMap[colour.paperId].push(colour);
  }
  for (const [paperId, colours] of Object.entries(paperColourMap)) {
    for (let i = 0; i < colours.length; i++) {
      await childrenCol(paperId).doc(colours[i].id).set({
        childLevelId: "level_3",
        published: false,
        order: i,
      });
    }
    const paper = PAPERS.find((p) => p.id === paperId);
    console.log(`   ✓ ${paper.name} → ${colours.map((c) => c.name).join(", ")}`);
  }

  // ── 6. Steps ─────────────────────────────────────────────────────────────
  console.log("\n6. Uploading step images and creating steps...");
  const cmsFlags = []; // items needing CMS attention

  for (const [colourId, steps] of Object.entries(STEPS)) {
    console.log(`   ${colourId}:`);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let imageUrl = "";

      if (step.imageFile) {
        process.stdout.write(`     Uploading ${step.imageFile}... `);
        imageUrl = await uploadImage(P800_REPO, step.imageFile, `steps/${colourId}/${slug(step.title)}/image`);
        console.log(imageUrl ? "✓" : "⚠ skipped");
      }

      await stepsCol(colourId).doc(`step-${step.stepNum}`).set({
        title: step.title,
        contentHtml: step.contentHtml,
        imageUrl,
        videoUrl: "",
        order: i,
        createdAt: NOW,
        lastModified: NOW,
        modifiedBy: "import-script",
      });

      if (!step.contentHtml) {
        cmsFlags.push({ type: "missing-text", colourId, stepNum: step.stepNum, title: step.title });
      }
      if (step.imageFile && !imageUrl) {
        cmsFlags.push({ type: "missing-image", colourId, stepNum: step.stepNum, file: step.imageFile });
      }
    }
    console.log(`     ✓ ${steps.length} steps created`);
  }

  // ── 7. Generate CMS notes ─────────────────────────────────────────────────
  console.log("\n7. Writing CMS notes file...");

  let notes = "# CMS Action Items — Post Import\n\n";
  notes += "Generated by scripts/import-content.js. Review each section and update via the admin CMS.\n\n";

  notes += "## Steps needing text content\n\n";
  const missingText = cmsFlags.filter((f) => f.type === "missing-text");
  if (missingText.length) {
    for (const f of missingText) {
      notes += `- **${f.colourId}** → ${f.title}: add step instructions\n`;
    }
  } else {
    notes += "_None_\n";
  }

  notes += "\n## P5070-specific screenshots to add\n\n";
  notes += "These images exist in the P5070 repo (`CI-EpsonP5070-Printing-Workflow/index.hyperesources/`) ";
  notes += "and should be added to the relevant steps via the CMS.\n\n";
  for (const entry of P5070_CMS_NOTES) {
    notes += `### ${entry.colour}\n`;
    for (const f of entry.files) notes += `- \`${f}\`\n`;
    notes += "\n";
  }

  notes += "## P800 sub-steps skipped (add via CMS if needed)\n\n";
  for (const f of SKIPPED_P800) notes += `- \`${f}\`\n`;

  const notesPath = "scripts/import-content-notes.md";
  writeFileSync(notesPath, notes, "utf-8");
  console.log(`   ✓ ${notesPath}`);

  console.log("\n=== Import complete ===");
  console.log(`   Review ${notesPath} for CMS action items.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error("\nImport failed:", err);
  process.exit(1);
});
