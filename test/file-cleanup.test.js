const test = require('node:test');
const assert = require('node:assert');

/**
 * Re-require the cleanup module with a given environment, since the limits are
 * read once at module load
 */
function cleanupWithEnv(overrides, files) {
  const cleanupPath = require.resolve('../src/file-cleanup');
  const minioPath = require.resolve('../src/minio-service');
  const previous = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  delete require.cache[cleanupPath];
  const minio = require(minioPath);
  const originalList = minio.listFiles;
  const originalDelete = minio.deleteFile;

  const deleted = [];
  minio.listFiles = async () => files;
  minio.deleteFile = async (name) => { deleted.push(name); };

  const { cleanupFiles } = require(cleanupPath);
  delete require.cache[cleanupPath];

  const restore = () => {
    minio.listFiles = originalList;
    minio.deleteFile = originalDelete;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  return { cleanupFiles, deleted, restore };
}

const recent = (n) => Array.from({ length: n }, (_, i) => ({
  filename: `file-${i}.prg`,
  lastModified: new Date(Date.now() - i * 1000),
}));

test('cleanup limit validation', async (t) => {
  await t.test('deletes nothing when MAX_FILES is not a number', async () => {
    // slice() treats NaN as 0, so an unguarded limit would select every file
    const { cleanupFiles, deleted, restore } = cleanupWithEnv(
      { MAX_FILES: 'none', MAX_AGE_DAYS: '7' }, recent(50)
    );
    try {
      await cleanupFiles();
      assert.deepEqual(deleted, []);
    } finally { restore(); }
  });

  await t.test('deletes nothing when MAX_FILES is empty', async () => {
    const { cleanupFiles, deleted, restore } = cleanupWithEnv(
      { MAX_FILES: '', MAX_AGE_DAYS: '7' }, recent(50)
    );
    try {
      await cleanupFiles();
      assert.deepEqual(deleted, []);
    } finally { restore(); }
  });

  await t.test('deletes nothing when MAX_AGE_DAYS is not a number', async () => {
    const { cleanupFiles, deleted, restore } = cleanupWithEnv(
      { MAX_FILES: '10', MAX_AGE_DAYS: 'never' }, recent(50)
    );
    try {
      await cleanupFiles();
      assert.deepEqual(deleted, []);
    } finally { restore(); }
  });

  await t.test('deletes nothing when MAX_FILES is zero or negative', async () => {
    for (const value of ['0', '-5']) {
      const { cleanupFiles, deleted, restore } = cleanupWithEnv(
        { MAX_FILES: value, MAX_AGE_DAYS: '7' }, recent(20)
      );
      try {
        await cleanupFiles();
        assert.deepEqual(deleted, [], `MAX_FILES=${value} deleted files`);
      } finally { restore(); }
    }
  });

  await t.test('still trims the overflow when the limits are valid', async () => {
    const { cleanupFiles, deleted, restore } = cleanupWithEnv(
      { MAX_FILES: '10', MAX_AGE_DAYS: '3650' }, recent(13)
    );
    try {
      await cleanupFiles();
      assert.equal(deleted.length, 3);
      assert.deepEqual(deleted, ['file-10.prg', 'file-11.prg', 'file-12.prg']);
    } finally { restore(); }
  });
});
