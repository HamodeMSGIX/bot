const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json'); //
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

let bot; // Declare bot globally
let chatInterval = null; // Declare chatInterval globally
let antiAfkInterval = null; // Declare antiAfkInterval globally

function getRandomUsername() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Bot_${suffix}`;
}

function createBot() {
  // Clear existing bot instance and its intervals before creating a new one
  if (bot) {
    console.log('[INFO] Quitting current bot before creating a new one.');
    // Clear chat interval if it exists
    if (chatInterval) {
      clearInterval(chatInterval);
      chatInterval = null;
    }
    // Clear anti-afk interval if it exists
    if (antiAfkInterval) {
      clearInterval(antiAfkInterval);
      antiAfkInterval = null;
    }
    // Only call quit if bot is an object and has the quit function
    if (typeof bot.quit === 'function') { // Ensure bot.quit exists before calling
      bot.quit();
    }
    bot = null; // Set bot to null to ensure a fresh instance is created
  }

  const username = getRandomUsername();
  console.log(`[INFO] Creating bot with username: ${username}`);

  bot = mineflayer.createBot({
    username: username,
    password: config['bot-account']['password'], //
    auth: config['bot-account']['type'], //
    host: config.server.ip, //
    port: config.server.port, //
    version: config.server.version, //
  });

  bot.loadPlugin(pathfinder);

  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log(`[Auth] Sent /register command.`);
      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully registered') || message.includes('already registered')) {
          resolve();
        } else {
          reject(`Registration error: ${message}`);
        }
      });
      // Add a timeout for registration to prevent hanging
      setTimeout(() => reject('Registration timed out.'), 10000); // 10 seconds
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log(`[Auth] Sent /login command.`);
      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully logged in')) {
          resolve();
        } else {
          reject(`Login error: ${message}`);
        }
      });
      // Add a timeout for login to prevent hanging
      setTimeout(() => reject('Login timed out.'), 10000); // 10 seconds
    });
  }

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    if (config.utils['auto-auth'].enabled) { //
      const password = config.utils['auto-auth'].password; //
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error(`\x1b[31m[ERROR] ${error}\x1b[0m`));
    }

    if (config.utils['chat-messages'].enabled) { //
      const messages = config.utils['chat-messages']['messages']; //
      // Ensure there are messages to send to prevent "Chat message type must be a string or number: undefined" error
      if (messages && messages.length > 0) {
        if (config.utils['chat-messages'].repeat) { //
          const delay = config.utils['chat-messages']['repeat-delay']; //
          let i = 0;
          // Assign the interval ID to the global chatInterval variable
          chatInterval = setInterval(() => {
            bot.chat(messages[i]);
            i = (i + 1) % messages.length;
          }, delay * 1000);
        } else {
          messages.forEach(msg => bot.chat(msg));
        }
      } else {
        console.warn('[AfkBot] Chat messages are enabled but no messages are defined in settings.json. Please add messages to the "messages" array.');
      }
    }

    const pos = config.position; //
    if (config.position.enabled) { //
      console.log(`\x1b[32m[Afk Bot] Moving to (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`); //
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z)); //
    }

    if (config.utils['anti-afk'].enabled) { //
      // Use setInterval for anti-afk to ensure bot methods are available after spawn
      antiAfkInterval = setInterval(() => {
        bot.setControlState('jump', true);
        if (config.utils['anti-afk'].sneak) { //
          bot.setControlState('sneak', true);
        }
        // Optional: Add slight random look changes for more realistic AFK behavior
        // bot.look(Math.random() * Math.PI * 2, 0);
      }, 500); // Every 500 milliseconds (half a second)
    }
  });

  // 'end' event is triggered when connection is lost for any reason (kick, error, or quit())
  bot.on('end', (reason) => {
    console.log(`\x1b[33m[AfkBot] Bot disconnected. Reason: ${reason}\x1b[0m`); //
    // Clear chat interval to prevent memory leaks
    if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
    }
    // Clear anti-afk interval upon disconnection
    if (antiAfkInterval) {
        clearInterval(antiAfkInterval);
        antiAfkInterval = null;
    }
    if (config.utils['auto-reconnect']) { //
      console.log(`[INFO] Reconnecting in ${config.utils['auto-recconect-delay'] / 1000} seconds with new username...`); //
      setTimeout(() => createBot(), config.utils['auto-recconect-delay']); //
    }
  });

  bot.on('kicked', reason => {
    console.log(`\x1b[33m[AfkBot] Kicked from server:\n${reason}\x1b[0m`);
  });

  bot.on('error', err => {
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[AfkBot] Bot arrived at target: ${bot.entity.position}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[AfkBot] Bot died. Respawned at ${bot.entity.position}\x1b[0m`);
  });
}

// Start the bot for the first time
createBot();

// Schedule a periodic restart (every 3 hours) to change username
setInterval(() => {
  console.log('[INFO] Scheduled restart: changing bot username...');
  createBot(); // This function now handles quitting the old bot and creating a new one.
}, 10800000); // 3 hours = 3 * 60 * 60 * 1000 = 10800000 milliseconds
