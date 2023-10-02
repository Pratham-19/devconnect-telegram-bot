const TelegramBot = require("node-telegram-bot-api");
const { teams } = require("./utils/constants");
const { addUser, getUser } = require("./prisma/helper");
require("dotenv").config();

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/(start|help)/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Hello ${
      msg.from.first_name || "User"
    } use,\n/register @user - to regsiter a user to a team\n/role @user - to get the role of a user\n/help - to get this message`,
    { parse_mode: "HTML" }
  );
});

// register @user

bot.onText(/\/register @(.+)|register/, (msg, match) => {
  const chatId = msg.chat.id;
  const resp = match[1];
  username = resp ? resp : msg.from.username;
  bot.sendMessage(chatId, `Select a Team`, {
    reply_markup: {
      one_time_keyboard: true,
      inline_keyboard: teams.map((team) => [
        {
          text: team.team,
          callback_data: JSON.stringify({
            action: "getRole",
            teamId: team.id,
            username,
          }),
        },
      ]),
    },
  });
});

// role @user
bot.onText(/\/role @(.+)|role/, async (msg, match) => {
  const username = match[1] ?? msg.from.username;
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Getting role for @${username}`);
  const user = await getUser(username);
  if (user) {
    bot.sendMessage(
      chatId,
      `@${user.username} is registered for ${user.team} as ${user.role}`
    );
  } else {
    bot.sendMessage(chatId, `@${username} is not registered`);
  }
});

bot.on("callback_query", async (query) => {
  const data = JSON.parse(query.data);
  const msg = query.message;
  const opts = {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
  };
  switch (data.action) {
    case "register":
      const role = teams
        .find((team) => team.id === parseInt(data.teamId))
        .roles.find((role) => role.id === parseInt(data.roleId)).role;
      const teamName = teams.find(
        (team) => team.id === parseInt(data.teamId)
      ).team;
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, opts);
      bot.sendMessage(
        msg.chat.id,
        `Registering @${data.username} for ${teamName} as ${role}`
      );
      const user = await addUser(data.username, teamName, role);

      if (user) {
        bot.sendMessage(
          msg.chat.id,
          `✅ ${user.username} have been registered for ${user.team} as ${user.role}`
        );
      } else {
        bot.sendMessage(msg.chat.id, `Something went wrong`);
      }

      break;
    case "getRole":
      const team = teams.find((team) => team.id === parseInt(data.teamId));

      bot.editMessageReplyMarkup({ inline_keyboard: [] }, opts);

      bot.sendMessage(msg.chat.id, `Select a Role`, {
        reply_markup: {
          one_time_keyboard: true,
          inline_keyboard: team.roles.map((role) => [
            {
              text: role.role,
              // callback_data: `register ${role.id} ${team.id} ${user}`,
              callback_data: JSON.stringify({
                action: "register",
                roleId: role.id,
                teamId: team.id,
                username: data.username,
              }),
            },
          ]),
        },
      });

      break;
    default:
      text = "I don't know what you want";
  }
});
