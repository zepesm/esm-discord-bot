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
  files.forEach((name, i) => attachments.set(String(i), { name, url: `https://cdn.example/${name}` }));

  return {
    id,
    content,
    attachments,
    webhookId,
    member,
    author: { id: authorId, bot, username: 'someone', displayAvatarURL: () => '' },
    client: { user: { id: SELF_ID } },
    deleted: false,
    replies: [],
    async delete() { this.deleted = true; },
    async reply(payload) { this.replies.push(payload); return {}; },
  };
}

/**
 * Re-require the handler with a given ALLOW_BOT_UPLOADS value, since the flag
 * is read once at module load. Every suite goes through this so an exported
 * ALLOW_BOT_UPLOADS in the ambient environment cannot flip the expectations.
 */
function handlerWithFlag(value) {
  const modulePath = require.resolve('../src/handlers/prg-file-handler');
  const previous = process.env.ALLOW_BOT_UPLOADS;

  if (value === undefined) delete process.env.ALLOW_BOT_UPLOADS;
  else process.env.ALLOW_BOT_UPLOADS = value;

  delete require.cache[modulePath];
  const Handler = require(modulePath);
  delete require.cache[modulePath];

  if (previous === undefined) delete process.env.ALLOW_BOT_UPLOADS;
  else process.env.ALLOW_BOT_UPLOADS = previous;

  return new Handler();
}

test('canHandle', async (t) => {
  const handler = handlerWithFlag(undefined);

  await t.test('picks up a .d64 posted by a human', () => {
    assert.equal(handler.canHandle(msg({ files: ['Pumpkins_side1.d64'] })), true);
  });

  await t.test('picks up .d64 files posted by a CI bot', () => {
    const build = msg({
      bot: true,
      content: 'Build #31 succeeded',
      files: ['Pumpkins_side1.d64', 'Pumpkins_side2.d64'],
    });
    assert.equal(handler.canHandle(build), true);
  });

  await t.test('picks up a .prg posted through a webhook', () => {
    assert.equal(handler.canHandle(msg({ webhookId: 'wh1', files: ['demo.prg'] })), true);
  });

  await t.test('ignores a bot message without attachments', () => {
    assert.equal(handler.canHandle(msg({ bot: true, content: 'Build #30 succeeded' })), false);
  });

  await t.test('ignores a bot message with unsupported attachments', () => {
    assert.equal(handler.canHandle(msg({ bot: true, files: ['build.log'] })), false);
  });

  await t.test('ignores prefix commands coming from a bot', () => {
    assert.equal(handler.canHandle(msg({ bot: true, content: 'c64 help' })), false);
  });

  await t.test('never reacts to its own messages', () => {
    const own = msg({ authorId: SELF_ID, bot: true, files: ['x.d64'] });
    assert.equal(handler.canHandle(own), false);
  });

  await t.test('still handles the prefix command without attachments', () => {
    assert.equal(handler.canHandle(msg({ content: 'c64 something' })), true);
  });

  await t.test('ignores regular chatter', () => {
    assert.equal(handler.canHandle(msg({ content: 'hehe well ok then' })), false);
  });
});

test('ALLOW_BOT_UPLOADS', async (t) => {
  const botUpload = () => msg({ bot: true, files: ['a.d64'] });

  for (const value of [undefined, 'true', 'TRUE', '1', 'yes']) {
    await t.test(`${value} keeps bot uploads enabled`, () => {
      assert.equal(handlerWithFlag(value).canHandle(botUpload()), true);
    });
  }

  for (const value of ['false', 'FALSE', ' false ', '0', 'no', 'off']) {
    await t.test(`${JSON.stringify(value)} disables bot uploads`, () => {
      assert.equal(handlerWithFlag(value).canHandle(botUpload()), false);
    });
  }
});

test('coexistence with SidFileHandler', async (t) => {
  const handler = handlerWithFlag(undefined);

  await t.test('says nothing about a .sid, which another handler owns', async () => {
    // The registry runs every matching handler, so a rejection from here would
    // land next to SidFileHandler's real answer for the same file
    const message = msg({ content: 'c64 listen to this', files: ['tune.sid'] });
    await handler.handle(message);

    assert.equal(message.replies.length, 0);
    assert.equal(message.deleted, false);
  });

  await t.test('still rejects a genuinely unsupported file', async () => {
    const message = msg({ content: 'c64 look', files: ['notes.txt'] });
    await handler.handle(message);

    assert.equal(message.replies.length, 1);
    assert.match(message.replies[0].content, /Skipping notes\.txt/);
    // A file called @everyone.txt must not ping the server through the bot
    assert.deepEqual(message.replies[0].allowedMentions, { parse: [] });
  });

  await t.test('never deletes a message that also carries a .sid', async () => {
    // PrgFileHandler runs first, so deleting here would break the SID reply
    handler.processAttachment = async (attachment) =>
      attachment.name.toLowerCase().endsWith('.prg');
    const message = msg({ content: 'c64', files: ['demo.prg', 'tune.sid'] });
    await handler.handle(message);

    assert.equal(message.deleted, false);
    delete handler.processAttachment;
  });
});

test('deletion policy', async (t) => {
  const handler = handlerWithFlag(undefined);

  await t.test('deletes a human message once every attachment succeeded', async () => {
    handler.processAttachment = async () => true;
    const message = msg({ files: ['a.d64'] });
    await handler.handle(message);
    assert.equal(message.deleted, true);
  });

  await t.test('keeps a CI bot message', async () => {
    handler.processAttachment = async () => true;
    const message = msg({ bot: true, files: ['a.d64', 'b.d64'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('keeps a webhook message', async () => {
    handler.processAttachment = async () => true;
    const message = msg({ webhookId: 'wh1', files: ['a.prg'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('keeps a human message when one attachment fails', async () => {
    let call = 0;
    handler.processAttachment = async () => ++call === 1;
    const message = msg({ files: ['a.d64', 'b.d64'] });
    await handler.handle(message);
    assert.equal(message.deleted, false);
  });

  await t.test('deletes only once for a message with several attachments', async () => {
    handler.processAttachment = async () => true;
    let deletes = 0;
    const message = msg({ files: ['a.d64', 'b.d64', 'c.d64'] });
    message.delete = async () => { deletes++; };
    await handler.handle(message);
    assert.equal(deletes, 1);
  });
});
