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

/**
 * Stand-in for the status message the handler posts and then keeps editing
 */
function statusStub() {
  return {
    edits: [],
    async edit(payload) { this.edits.push(payload); return this; },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('SidFileHandler progress reporting', async (t) => {
  const handler = handlerWithEnv(cleanEnv);

  await t.test('does nothing when the status message never posted', () => {
    assert.equal(handler.progressReporter(null, 'LOAD', 'tune.sid'), undefined);
  });

  await t.test('draws a progress bar into the status message', async () => {
    const status = statusStub();
    handler.progressReporter(status, 'LOAD "$",8,1', 'tune.sid')({ phase: 'render', fraction: 0.5 });
    await tick();

    assert.equal(status.edits.length, 1);
    assert.match(status.edits[0].content, /LOAD "\$",8,1/);
    assert.match(status.edits[0].content, /tune\.sid/);
    assert.match(status.edits[0].content, /50%/);
  });

  await t.test('throttles rapid updates instead of hammering the API', async () => {
    const status = statusStub();
    const report = handler.progressReporter(status, 'LOAD', 'tune.sid');

    report({ phase: 'render', fraction: 0.1 });
    await tick();
    for (const fraction of [0.2, 0.3, 0.4, 0.5]) report({ phase: 'render', fraction });
    await tick();

    assert.equal(status.edits.length, 1);
  });

  await t.test('says something different once encoding starts', async () => {
    const status = statusStub();
    handler.progressReporter(status, 'LOAD', 'tune.sid')({ phase: 'encode', fraction: 1 });
    await tick();

    assert.match(status.edits[0].content, /tape/i);
    assert.doesNotMatch(status.edits[0].content, /100%/);
  });

  await t.test('survives an edit that fails', async () => {
    const status = { async edit() { throw new Error('unknown message'); } };
    handler.progressReporter(status, 'LOAD', 'tune.sid')({ phase: 'render', fraction: 0.5 });
    await tick();
    // Reaching here without an unhandled rejection is the assertion
    assert.ok(true);
  });
});

test('SidFileHandler status message lifecycle', async (t) => {
  const handler = handlerWithEnv(cleanEnv);

  await t.test('replaces the loading line rather than posting again', async () => {
    const status = statusStub();
    const message = msg({ files: ['tune.sid'] });

    await handler.finish(status, message, { embeds: [{ title: 'tune.sid' }] });

    assert.equal(status.edits.length, 1);
    assert.equal(message.replies.length, 0);
    // Without this the loading line would sit above the finished player
    assert.equal(status.edits[0].content, null);
  });

  await t.test('falls back to a fresh reply when there is no status message', async () => {
    const message = msg({ files: ['tune.sid'] });
    await handler.finish(null, message, { content: 'done' });

    assert.equal(message.replies.length, 1);
    assert.equal(message.replies[0].content, 'done');
  });

  await t.test('falls back to a reply when the edit fails', async () => {
    const status = { async edit() { throw new Error('unknown message'); } };
    const message = msg({ files: ['tune.sid'] });

    await handler.finish(status, message, { content: 'done' });

    assert.equal(message.replies.length, 1);
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
    assert.match(message.replies[0].content, /left 2 on the flip side/);
    // A capped message is not fully handled, so it must survive
    assert.equal(message.deleted, false);
  });
});
