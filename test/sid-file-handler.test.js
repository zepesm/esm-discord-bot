const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');

const SELF_ID = 'our-bot-id';

/**
 * Build a stub Discord message good enough for canHandle/handle
 */
function msg({
  id = 'm1',
  authorId = 'u1',
  bot = false,
  webhookId = null,
  content = '',
  files = [],
  member = null,
} = {}) {
  const attachments = new Collection();
  files.forEach((name, i) => attachments.set(String(i), { name, url: `https://cdn.example/${name}`, size: 4096 }));

  return {
    id,
    content,
    attachments,
    webhookId,
    member,
    channelId: 'c1',
    author: { id: authorId, bot, username: 'someone', displayAvatarURL: () => '' },
    client: { user: { id: SELF_ID } },
    deleted: false,
    replies: [],
    async delete() { this.deleted = true; },
    async reply(payload) { this.replies.push(payload); return {}; },
  };
}

/**
 * Re-require the handler with the given environment, since both it and the SID
 * service read their configuration once at module load. Every suite goes
 * through this so the ambient environment cannot flip any expectation.
 */
function handlerWithEnv(overrides = {}) {
  const handlerPath = require.resolve('../src/handlers/sid-file-handler');
  const servicePath = require.resolve('../src/sid-service');
  const previous = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  delete require.cache[handlerPath];
  delete require.cache[servicePath];
  const Handler = require(handlerPath);
  delete require.cache[handlerPath];
  delete require.cache[servicePath];

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return new Handler();
}

const cleanEnv = { SID_ENABLED: undefined, ALLOW_BOT_UPLOADS: undefined };

test('SidFileHandler.canHandle', async (t) => {
  const handler = handlerWithEnv(cleanEnv);

  await t.test('picks up a .sid posted by a human', () => {
    assert.equal(handler.canHandle(msg({ files: ['Commando.sid'] })), true);
  });

  await t.test('is case insensitive', () => {
    assert.equal(handler.canHandle(msg({ files: ['COMMANDO.SID'] })), true);
  });

  await t.test('picks up a .sid posted by a CI bot', () => {
    assert.equal(handler.canHandle(msg({ bot: true, files: ['tune.sid'] })), true);
  });

  await t.test('picks up a .sid posted through a webhook', () => {
    assert.equal(handler.canHandle(msg({ webhookId: 'wh1', files: ['tune.sid'] })), true);
  });

  await t.test('never reacts to its own messages', () => {
    const own = msg({ authorId: SELF_ID, bot: true, files: ['tune.sid'] });
    assert.equal(handler.canHandle(own), false);
  });

  await t.test('ignores emulator formats, which belong to PrgFileHandler', () => {
    assert.equal(handler.canHandle(msg({ files: ['demo.prg'] })), false);
    assert.equal(handler.canHandle(msg({ files: ['disk.d64'] })), false);
  });

  await t.test('never claims a bare prefix command', () => {
    // Otherwise the user would get this handler's reply on top of PrgFileHandler's help
    assert.equal(handler.canHandle(msg({ content: 'c64 help' })), false);
    assert.equal(handler.canHandle(msg({ content: 'c64 something', files: ['demo.prg'] })), false);
  });

  await t.test('still claims a prefixed message that does carry a .sid', () => {
    assert.equal(handler.canHandle(msg({ content: 'c64 listen', files: ['tune.sid'] })), true);
  });
});

test('SidFileHandler configuration gates', async (t) => {
  await t.test('SID_ENABLED=false turns the handler off entirely', () => {
    const handler = handlerWithEnv({ ...cleanEnv, SID_ENABLED: 'false' });
    assert.equal(handler.canHandle(msg({ files: ['tune.sid'] })), false);
  });

  await t.test('SID_ENABLED=0 also turns it off', () => {
    const handler = handlerWithEnv({ ...cleanEnv, SID_ENABLED: '0' });
    assert.equal(handler.canHandle(msg({ files: ['tune.sid'] })), false);
  });

  await t.test('ALLOW_BOT_UPLOADS=false keeps bot uploads out', () => {
    const handler = handlerWithEnv({ ...cleanEnv, ALLOW_BOT_UPLOADS: 'false' });
    assert.equal(handler.canHandle(msg({ bot: true, files: ['tune.sid'] })), false);
    assert.equal(handler.canHandle(msg({ files: ['tune.sid'] })), true);
  });
});

test('SidFileHandler deletion policy', async (t) => {
  const handler = handlerWithEnv(cleanEnv);

  await t.test('deletes a human message of nothing but rendered tunes', async () => {
    handler.processAttachment = async () => true;
    const message = msg({ files: ['a.sid', 'b.sid'] });
    await handler.handle(message);
    assert.equal(message.deleted, true);
  });

  await t.test('keeps a CI bot message', async () => {
    handler.processAttachment = async () => true;
    const message = msg({ bot: true, files: ['a.sid'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('keeps a webhook message', async () => {
    handler.processAttachment = async () => true;
    const message = msg({ webhookId: 'wh1', files: ['a.sid'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('keeps the message when a render failed', async () => {
    let call = 0;
    handler.processAttachment = async () => ++call === 1;
    const message = msg({ files: ['a.sid', 'b.sid'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('keeps a mixed message, which PrgFileHandler also owns', async () => {
    // Deleting here would pull the message out from under the other handler
    handler.processAttachment = async () => true;
    const message = msg({ files: ['a.sid', 'demo.prg'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('only renders the .sid attachments of a mixed message', async () => {
    const seen = [];
    handler.processAttachment = async (attachment) => { seen.push(attachment.name); return true; };
    await handler.handle(msg({ files: ['a.sid', 'demo.prg', 'b.sid'] }));
    assert.deepEqual(seen, ['a.sid', 'b.sid']);
  });
});

test('SidFileHandler per-message cap', async (t) => {
  await t.test('renders only the first few tunes and says so', async () => {
    const handler = handlerWithEnv({ ...cleanEnv, SID_MAX_FILES_PER_MESSAGE: '2' });
    const seen = [];
    handler.processAttachment = async (attachment) => { seen.push(attachment.name); return true; };

    const message = msg({ files: ['a.sid', 'b.sid', 'c.sid', 'd.sid'] });
    await handler.handle(message);

    assert.deepEqual(seen, ['a.sid', 'b.sid']);
    assert.equal(message.replies.length, 1);
    assert.match(message.replies[0].content, /2 more were skipped/);
    // A capped message is not fully handled, so it must survive
    assert.equal(message.deleted, false);
  });
});
