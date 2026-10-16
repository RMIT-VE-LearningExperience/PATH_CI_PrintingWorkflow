const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { collectStoragePaths } = require('../lib/storageReferences');

const database = 'path-ci-printingworkflows';
const prefix = `${database}/`;
const bucket = 'printer-app-531a8.firebasestorage.app';
const url = name => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(prefix + name)}?alt=media&token=old`;

function loadHandlers(services) {
  const exports = {};
  const logs = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/cleanupOrphanedImages'), 'utf8'), {
    exports,
    require(name) {
      if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_options, handler) => handler };
      if (name === 'firebase-admin/firestore') return { getFirestore: services.getFirestore };
      if (name === 'firebase-admin/storage') return { getStorage: services.getStorage };
      if (name === './storageReferences') return { collectStoragePaths };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { log: (...args) => logs.push(args.join(' ')), warn() {} },
    Set,
  });
  return { exports, logs };
}

test('cleanup cannot access storage or stale orphan records', async () => {
  const unexpected = () => { throw new Error('Cleanup accessed a service'); };
  const { exports } = loadHandlers({ getFirestore: unexpected, getStorage: unexpected });
  await exports.printingWorkflowCleanupOrphanedImages();
});

test('audit uses named database, includes missing parents and scopes storage without writing', async () => {
  const visited = [];
  const leaf = (path, data) => ({
    get: async () => ({ data: () => data }),
    listCollections: async () => [],
  });
  const roots = {
    items: { listDocuments: async () => [leaf('items/draft', { imageUrls: [url('draft.jpg')] })] },
    steps: { listDocuments: async () => [{
      get: async () => ({ data: () => undefined }),
      listCollections: async () => [{ listDocuments: async () => [leaf('steps/missing/items/step', { contentHtml: `<img src="${url('step.jpg')}">` })] }],
    }] },
    deletedItems: { listDocuments: async () => [leaf('deletedItems/trash', { nested: { imageUrl: url('trash.jpg') } })] },
    settings: { listDocuments: async () => [leaf('settings/homepage', { thumbnailUrl: url('homepage.jpg') })] },
  };
  const { exports, logs } = loadHandlers({
    getFirestore(id) {
      assert.equal(id, database);
      return { collection(name) { visited.push(name); return roots[name]; } };
    },
    getStorage: () => ({ bucket(name) {
      assert.equal(name, bucket);
      return { getFiles: async options => {
        assert.equal(options.prefix, prefix);
        return [['draft.jpg', 'step.jpg', 'trash.jpg', 'homepage.jpg', 'candidate.jpg'].map(name => ({ name: prefix + name }))];
      } };
    } }),
  });
  await exports.printingWorkflowAuditOrphanedImages();
  assert.deepEqual(visited, ['items', 'steps', 'deletedItems', 'settings']);
  assert.equal(logs.filter(line => line.includes('candidate (report only)')).length, 1);
  assert.ok(logs.some(line => line.includes(prefix + 'candidate.jpg')));
  assert.ok(logs.some(line => line.includes('4 referenced paths, 1 candidates. No files deleted or queued.')));
});

test('failed database read aborts before storage is listed or any candidate is reported', async () => {
  const { exports, logs } = loadHandlers({
    getFirestore: () => ({ collection: () => ({ listDocuments: async () => { throw new Error('Read failed'); } }) }),
    getStorage: () => { throw new Error('Storage must not be accessed after a failed read'); },
  });
  await assert.rejects(exports.printingWorkflowAuditOrphanedImages(), /Read failed/);
  assert.deepEqual(logs, []);
});
