const TelegramBot = require("node-telegram-bot-api");
const MongoClient = require('mongodb').MongoClient;
const express = require('express');
const ejs = require('ejs');
const amqp = require('amqplib');
const {ObjectId} = require("mongodb");
const token = process.env.BOT_TOKEN ?? "";

const bot = new TelegramBot(token, {polling: true});
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {});

const admins = process.env.ADMINS.split(",");
const app = express();

app.set('view engine', 'ejs');

// helpers
function calculateStartTime(day, commitment) {
    const date = new Date(`13 Nov 2023 ${commitment.startTime}`);
    date.setDate(date.getDate() + day - 1);
    return date;
}

function calculateEndTime(day, commitment) {
    const date = new Date(`13 Nov 2023 ${commitment.endTime}`);
    date.setDate(date.getDate() + day - 1);
    return date;
}

async function createReminder(message, date, exchange = "reminders", routingKey = "reminders") {
    let delay = date - Date.now();
    // delay = 300000; // 5 min

    if (delay < 0) {
        console.error('Date provided is in the past');
        return;
    }

    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(exchange, 'x-delayed-message', {
        arguments: {'x-delayed-type': 'direct'}
    });

    const messageBuffer = Buffer.from(message);

    channel.publish(exchange, routingKey, messageBuffer, {
        headers: { 'x-delay': delay }
    });

    console.log(`Sent a message with a delay of ${delay} ms`);

    setTimeout(() => {
        connection.close();
    }, 500);
}

// constants

const keys = {
    MYROLE: "myrole",
    ADDCOMMITMENT: "addCommitment",
    OTHERROLE: "otherRoles",
    ADDROLE: "addRole",
    UPDATEROLE: "updateRole",
    DELETEUSER: "delUser",
    DELETECOMMITMENT: "delCommitment",
    FINDCOMMITMENT: "findCommitment",
    FINDBYTEAM: "findUsersByTeamAndCommitment",
    FINDBYCOMMITMENT: "findUsersByCommitment",
    SWAPCOMMITMENT: "swapCommitment",
    BACK: "back"
}
const textKeys = {
    GETROLE: "/roleof",
    GIVEROLE: "/give",
    UPDATEROLE: "/updateuser",
    DELETEUSER: "/deluser",
    ADDCOMMITMENT: "/add",
    DELETECOMMITMENT: "/del",
    GETCOMMITMENT: "/get",
    FINDBYTEAM: "/findbyteam",
    FINDBYCOMMITMENT: "/find",
    SWAPCOMMITMENT: "/swap",
}
const commitments = {
    1: {
        startTime: "08:30:00",
        endTime: "14:29:59"
    },
    2: {
        startTime: "14:30:00",
        endTime: "20:29:59"
    }
}
const days = {
    13: 1,
    14: 2,
    15: 3,
    16: 4,
    17: 5,
    18: 6,
    19: 7,
    20: 8
}

const menu = {
    ROLE: "rolemenu",
    COMMITMENTS: "schedulemenu"
}

function menuKeyboard(keyboardName, username) {
    if (keyboardName === menu.ROLE) {
        let buttons = [
            [
                {
                    "text": "Check My Role",
                    "callback_data": keys.MYROLE
                }
            ],
            [
                {
                    "text": "Check Other's Role",
                    "callback_data": keys.OTHERROLE
                }
            ]
        ];

        if (admins.includes(username)) {
            buttons.push(
                [
                    {
                        "text": "View all teams",
                        "url": `${process.env.BASE_URL}/roles`
                    }
                ],
                [
                    {
                        "text": "Add Role",
                        "callback_data": keys.ADDROLE
                    }
                ],
                [
                    {
                        "text": "Update Role",
                        "callback_data": keys.UPDATEROLE
                    }
                ],
                [
                    {
                        "text": "Delete User",
                        "callback_data": keys.DELETEUSER
                    }
                ],
            );
        }

        buttons.push(
            [
                {
                    "text": "← Back",
                    "callback_data": keys.BACK
                }
            ]
        );

        return {
            "inline_keyboard": buttons
        };
    } else if (keyboardName === menu.COMMITMENTS) {
        let buttons = [
            [
                {
                    "text": "Get commitments",
                    "callback_data": keys.FINDCOMMITMENT
                }
            ],
            [
                {
                    "text": "Find users by commitment & your team",
                    "callback_data": keys.FINDBYTEAM
                }
            ],
            [
                {
                    "text": "Find users by commitments",
                    "callback_data": keys.FINDBYCOMMITMENT
                }
            ]
        ];

        if (admins.includes(username)) {
            buttons.push(
                [
                    {
                        "text": "Add commitment",
                        "callback_data": keys.ADDCOMMITMENT
                    }
                ],
                [
                    {
                        "text": "View all commitments",
                        "url": `${process.env.BASE_URL}/commitments`
                    }
                ],
                [
                    {
                        "text": "Swap commitment",
                        "callback_data": keys.SWAPCOMMITMENT
                    }
                ],
                [
                    {
                        "text": "Delete commitment",
                        "callback_data": keys.DELETECOMMITMENT
                    }
                ]
            );
        }

        buttons.push(
            [
                {
                    "text": "← Back",
                    "callback_data": keys.BACK
                }
            ]
        );

        return {
            "inline_keyboard": buttons
        }
    } else {
        return {
            "inline_keyboard": [
                [
                    {
                        "text": "Teams",
                        "callback_data": menu.ROLE
                    }
                ],
                [
                    {
                        "text": "Schedule",
                        "callback_data": menu.COMMITMENTS
                    }
                ],
                [
                    {
                        "text": "Volunteer Home Page Notion",
                        "url": process.env.VOLUNTEER_HOMEPAGE_URL
                    }
                ],
                [
                    {
                        "text": "Master Schedule Notion",
                        "url": process.env.MAIN_SCHEDULE_URL
                    }
                ],
                [
                    {
                        "text": "Incident Response Form",
                        "url": process.env.INCIDENT_RESPONSE_FORM_URL
                    }
                ]
            ]
        }
    }
}

// bot

client.connect().then(() => {
    const rolesCollection = client.db("database").collection("roles");
    const scheduleCollection = client.db("database").collection("schedule");
    bot.on("callback_query", async (query) => {
        const action = query.data;
        const msg = query.message;
        const user = query.from.username;
        const opts = {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
        };

        switch (action) {
            case menu.ROLE:
                bot.editMessageText('What team function do you want to use?', opts)
                .then(() => {
                    bot.editMessageReplyMarkup(menuKeyboard(menu.ROLE, user), opts);
                });
                break;
            case menu.COMMITMENTS:
                bot.editMessageText('What schedule function do you want to use?', opts)
                .then(() => {
                    bot.editMessageReplyMarkup(menuKeyboard(menu.COMMITMENTS, user), opts);
                });
                break;
            case keys.DELETECOMMITMENT:
                if (!admins.includes(user)) {
                    bot.sendMessage(opts.chat_id, "🚫 You do not have permission to perform this action");
                    return;
                }
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to delete commitment\n\n${textKeys.DELETECOMMITMENT} username, day(13-20)\n\ne.g ${textKeys.DELETECOMMITMENT} @bugbyt, 14`);
                break;
            case keys.SWAPCOMMITMENT:
                if (!admins.includes(user)) {
                    bot.sendMessage(opts.chat_id, "🚫 You do not have permission to perform this action");
                    return;
                }
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to swap commitment with teammate\n\n${textKeys.SWAPCOMMITMENT} user1, user2, day1(13-20), day2(13-20)\n\ne.g ${textKeys.SWAPCOMMITMENT} @bugbyt, @kokocares, 14, 16\n${textKeys.SWAPCOMMITMENT} @bugbyt, @kokocares, 14, 14 (for same day swap)`);
                break;
            case keys.FINDBYTEAM:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to find users of your team on particular commitment,\n1 - morning commitment (8:30am-2:30pm),\n2 - afternoon commitment (2:30pm-8:30pm)\n\n${textKeys.FINDBYTEAM} username, day(13-20), commitment(1,2)\n\ne.g ${textKeys.FINDBYTEAM} @bugbyt, 14, 2`);
                break;
            case keys.FINDBYCOMMITMENT:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to find users by commitment,\n1 - morning commitment (8:30am-2:30pm),\n2 - afternoon commitment (2:30pm-8:30pm)\n\n${textKeys.FINDBYCOMMITMENT} day(13-20), commitment(1,2)\n\ne.g ${textKeys.FINDBYCOMMITMENT} 14, 2`);
                break;
            case keys.FINDCOMMITMENT:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to find commitments\n\n${textKeys.GETCOMMITMENT} username\n\ne.g ${textKeys.GETCOMMITMENT} @bugbyt`);
                break;
            case keys.ADDROLE:
                if (!admins.includes(user)) {
                    bot.sendMessage(opts.chat_id, "🚫 You do not have permission to perform this action");
                    return;
                }
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to add role\n\n${textKeys.GIVEROLE} username, team, role, spoken language\n\ne.g ${textKeys.GIVEROLE} @bugbyt, Co-Working Team, Volunteer, English`);
                break;
            case keys.OTHERROLE:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to get other's role\n\n${textKeys.GETROLE} username\n\ne.g ${textKeys.GETROLE} @bugbyt`);
                break;
            case keys.UPDATEROLE:
                if (!admins.includes(user)) {
                    bot.sendMessage(opts.chat_id, "🚫 You do not have permission to perform this action");
                    return;
                }
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to update role\n\n${textKeys.UPDATEROLE} username, team, role\n\ne.g ${textKeys.UPDATEROLE} @bugbyt, Co-Working Team, Volunteer`);
                break;
            case keys.DELETEUSER:
                if (!admins.includes(user)) {
                    bot.sendMessage(opts.chat_id, "🚫 You do not have permission to perform this action");
                    return;
                }
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to delete role\n\n${textKeys.DELETEUSER} username\n\ne.g ${textKeys.DELETEUSER} @bugbyt`);
                break;
            case keys.ADDCOMMITMENT:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Use the following command to add commitment,\n1 - morning commitment (8:30am-2:30pm),\n2 - afternoon commitment (2:30pm-8:30pm)\n\n${textKeys.ADDCOMMITMENT} username, day(13-20), Commitment (1,2)\n\ne.g ${textKeys.ADDCOMMITMENT} @bugbyt, 15, 2 `);
                break;
            case keys.MYROLE:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, `Getting @${user}'s role`);
                const username = `@${user}`;
                const foundUser = await rolesCollection.findOne({username: username});
                if (foundUser) {
                    bot.sendMessage(opts.chat_id, `${foundUser.username} is in ${foundUser.team} as ${foundUser.role}`);
                } else {
                    bot.sendMessage(opts.chat_id, `No role assigned to @${user}`);
                }
                break;
            case keys.BACK:
                bot.editMessageText(`Hey @${user},\nWhat can I help u with today?`, opts)
                    .then(() => {
                        bot.editMessageReplyMarkup(menuKeyboard("", user), opts);
                    });
                break;
            default:
                bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                bot.sendMessage(opts.chat_id, "❌ Invalid response retry!");
                break;
        }
    });

    bot.on("message", async (msg) => {
        const chat_id = msg.chat.id;
        const user = msg.from.username;
        const text = msg.text;

        const action = !!text ? text.split(" ")[0].toLowerCase() : "";

        if (action === textKeys.GETROLE) {
            let msg = text.split(" ");
            if (msg.length !== 2) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }
            const username = msg[1].trim();
            bot.sendMessage(chat_id, `Getting ${username}'s role`);
            const user = await rolesCollection.findOne({username: username});
            if (user) {
                bot.sendMessage(chat_id, `${user.username} is in ${user.team} as ${user.role}`);
            } else {
                bot.sendMessage(chat_id, `No role assigned to ${username}`);
            }
        } else if (action === textKeys.GETCOMMITMENT) {
            let msg = text.split(" ");
            if (msg.length !== 2) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }
            const username = msg[1].trim();
            let commitments = await scheduleCollection.find({username: username}).toArray();
            if (commitments && commitments.length !== 0) {
                bot.sendMessage(chat_id, "--- Your Commitments ---");
                commitments.forEach((commitment, index) => {
                    bot.sendMessage(chat_id, `Start Time: ${commitment.startTime.toLocaleString()}\nEnd Time: ${commitment.endTime.toLocaleString()}`);
                    if (index === commitments.length - 1)
                        bot.sendMessage(chat_id, "   ---   ");
                });
            } else {
                bot.sendMessage(chat_id, `No commitments found for ${username}`);
            }
        } else if (action === textKeys.FINDBYTEAM) {
            let msg = text.split(',');

            if (msg.length !== 3) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
            } else {
                const username = msg[0].split(" ")[1].trim();
                const day = days[msg[1].trim()];
                const commitment = commitments[msg[2].trim()];
                const role = await rolesCollection.findOne({username: username});

                // validate input
                if(!day || !commitment) {
                    bot.sendMessage(chat_id, "❌ Invalid format!");
                    return;
                }
                if (!role) {
                    bot.sendMessage(chat_id, `⚠️ ${username} does not have a team!`);
                    return;
                }

                const team = role.team;
                const startTime = calculateStartTime(day, commitment);
                const endTime = calculateEndTime(day, commitment);
                let users = await rolesCollection.find({team: team}).toArray();
                users = users.filter(async u => {
                    const commitments = await scheduleCollection.find({
                        username: u.username,
                        startTime: startTime,
                        endTime: endTime
                    }).toArray();
                    return commitments.length !== 0;
                })

                if (users && users.length !== 0) {
                    bot.sendMessage(chat_id, "--- Users ---");
                    users.forEach((user, index) => {
                        bot.sendMessage(chat_id, `${user.username}`);
                        if (index === users.length - 1)
                            bot.sendMessage(chat_id, "   ---   ");
                    });
                } else {
                    bot.sendMessage(chat_id, `No users found for matching criteria`);
                }
            }
        } else if (action === textKeys.SWAPCOMMITMENT) {
            if (!admins.includes(user)) {
                bot.sendMessage(chat_id, "🚫 You do not have permission to perform this action");
                return;
            }

            let msg = text.split(',');
            if (msg.length !== 4) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }
            let user1 = msg[0].split(" ")[1].trim();
            let user2 = msg[1].trim();
            let day1 = parseInt(msg[2].trim());
            let day2 = parseInt(msg[3].trim());
            let user1Role = await rolesCollection.findOne({username: user1});
            let user2Role = await rolesCollection.findOne({username: user2});
            if (user1Role && user2Role) {
                if (user1Role.team === user2Role.team && user1Role.role === user2Role.role) {
                    let commitments1 = await scheduleCollection.find({
                        username: user1,
                        startTime: {
                            $gte: new Date(`2023-11-${day1}T00:00:00`),
                            $lte: new Date(`2023-11-${day1}T23:59:59`)
                        }
                    });
                    let commitments2 = await scheduleCollection.find({
                        username: user2,
                        startTime: {
                            $gte: new Date(`2023-11-${day2}T00:00:00`),
                            $lte: new Date(`2023-11-${day2}T23:59:59`)
                        }
                    });
                    if (commitments1 && commitments2) {
                        // swap commitments
                        await scheduleCollection.updateMany({
                            username: user1,
                            startTime: {
                                $gte: new Date(`2023-11-${day1}T00:00:00`),
                                $lte: new Date(`2023-11-${day1}T23:59:59`)
                            }
                        }, {$set: {username: user2}});
                        await scheduleCollection.updateMany({
                            username: user2,
                            startTime: {
                                $gte: new Date(`2023-11-${day2}T00:00:00`),
                                $lte: new Date(`2023-11-${day2}T23:59:59`)
                            }
                        }, {$set: {username: user1}});
                        bot.sendMessage(chat_id, "✅ Commitments swapped successfully");
                    } else {
                        bot.sendMessage(chat_id, "⚠️ No commitment assigned to user on specified day");
                    }
                } else {
                    bot.sendMessage(chat_id, "Can't swap with different team/role user");
                }
            } else {
                bot.sendMessage(chat_id, "⚠️ No role assigned to user");
            }
        } else if (action === textKeys.FINDBYCOMMITMENT) {
            let msg = text.split(',');

            if (msg.length !== 2) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
            } else {
                const day = days[msg[0].split(" ")[1].trim()];
                const commitment = commitments[msg[1].trim()];

                // validate input
                if(!day || !commitment) {
                    bot.sendMessage(chat_id, "❌ Invalid format!");
                    return;
                }

                const startTime = calculateStartTime(day, commitment);
                const endTime = calculateEndTime(day, commitment);
                let users = await scheduleCollection.find({startTime: startTime, endTime: endTime}).toArray();

                if (users && users.length !== 0) {
                    bot.sendMessage(chat_id, "--- Users ---");
                    users.forEach((user, index) => {
                        bot.sendMessage(chat_id, `${user.username}`);
                        if (index === users.length - 1)
                            bot.sendMessage(chat_id, "   ---   ");
                    });
                } else {
                    bot.sendMessage(chat_id, `No users found for matching criteria`);
                }
            }
        } else if (action === textKeys.ADDCOMMITMENT) {
            let msg = text.split(',');

            if (msg.length !== 3) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
            } else {
                const username = msg[0].split(" ")[1].trim();
                const day = days[msg[1].trim()];
                const commitment = commitments[msg[2].trim()];
                const role = await rolesCollection.findOne({username: username});

                // validate input
                if(!day || !commitment) {
                    bot.sendMessage(chat_id, "❌ Invalid format!");
                    return;
                }
                if (!role) {
                    bot.sendMessage(chat_id, `⚠️ ${username} does not have a team!`);
                    return;
                }

                const startTime = calculateStartTime(day, commitment);
                const endTime = calculateEndTime(day, commitment);
                const overlap = await scheduleCollection.findOne({
                    username: username,
                    startTime: {$lte: endTime},
                    endTime: {$gte: startTime}
                });
                if (overlap) {
                    bot.sendMessage(chat_id, "⚠️ Commitment already exists!");
                } else {
                    // add commitment to existing list of commitments for user
                    const newCommitment = await scheduleCollection.insertOne({
                        username: username,
                        startTime: startTime,
                        endTime: endTime
                    });
                    bot.sendMessage(chat_id, "✅ Added Successfully");


                    const reminderMessage = `Hey ${username}, you have an upcoming commitment at ${startTime.toLocaleString()}`;

                    // create reminder for commitment 3 days before
                    await createReminder(JSON.stringify({
                        chat_id: chat_id,
                        commitmentId: newCommitment.insertedId,
                        message: reminderMessage
                    }), startTime - 259200000);

                    // create reminder for commitment 1 day before
                    await createReminder(JSON.stringify({
                        chat_id: chat_id,
                        commitmentId: newCommitment.insertedId,
                        message: reminderMessage
                    }), startTime - 86400000);

                    // create reminder for commitment 1 hour before
                    await createReminder(JSON.stringify({
                        chat_id: chat_id,
                        commitmentId: newCommitment.insertedId,
                        message: reminderMessage
                    }), startTime - 3600000);
                }
            }
        } else if (action === textKeys.GIVEROLE) {
            if (!admins.includes(user)) {
                bot.sendMessage(chat_id, "🚫 You do not have permission to perform this action");
                return;
            }

            let msg = text.split(',');

            if (msg.length !== 4) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }

            const username = msg[0].split(" ")[1].trim();
            const team = msg[1].trim();
            const role = msg[2].trim();
            const language = msg[3].trim();

            const existingUser = await rolesCollection.findOne({username: username});
            if (existingUser) {
                bot.sendMessage(chat_id, "⚠️ Role exists");
                bot.sendMessage(chat_id, `${existingUser.username} is in ${existingUser.team} as ${existingUser.role}`);
            } else {
                const newUser = {username: username, team: team, role: role, language: language};
                await rolesCollection.insertOne(newUser);
                bot.sendMessage(chat_id, "✅ Added Successfully");
            }
        } else if (action === textKeys.UPDATEROLE) {
            if (!admins.includes(user)) {
                bot.sendMessage(chat_id, "🚫 You do not have permission to perform this action");
                return;
            }

            let msg = text.split(',');
            if (msg.length !== 3) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }
            const username = msg[0].split(" ")[1].trim();
            const team = msg[1].trim();
            const role = msg[2].trim();

            const existingUser = await rolesCollection.findOne({username: username});
            if (existingUser) {
                if (msg.length === 3) {
                    await rolesCollection.updateOne({username: username}, {$set: {team: team, role: role}});
                    bot.sendMessage(chat_id, "✅ Updated Successfully");
                } else {
                    bot.sendMessage(chat_id, "❌ Invalid response retry!");
                }
            } else {
                bot.sendMessage(chat_id, "⚠️ No user found");
            }
        } else if (action === textKeys.DELETEUSER) {
            if (!admins.includes(user)) {
                bot.sendMessage(chat_id, "🚫 You do not have permission to perform this action");
                return;
            }

            let msg = text.split(" ");
            if (msg.length !== 2) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }
            const username = msg[1];
            const result = await rolesCollection.deleteOne({username: username});
            if (result.deletedCount > 0) {
                bot.sendMessage(chat_id, `✅ user deleted`);

                // delete all commitments for user
                await scheduleCollection.deleteMany({username: username});
            } else {
                bot.sendMessage(chat_id, `⚠️ No user found`);
            }
        } else if (action === textKeys.DELETECOMMITMENT) {
            if (!admins.includes(user)) {
                bot.sendMessage(chat_id, "🚫 You do not have permission to perform this action");
                return;
            }

            let msg = text.split(" ");
            if (msg.length !== 3) {
                bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }
            const username = msg[1].trim().split(",")[0].trim();
            const day = parseInt(msg[2].trim());
            const startDate = new Date(`${day} Nov 2023 00:00:00`)
            const endDate = new Date(`${day} Nov 2023 23:59:59`)
            const commitmentsForUser = await scheduleCollection.find({
                username: username,
                startTime: {$lte: endDate},
                endTime: {$gte: startDate}
            }).toArray();
            if (commitmentsForUser.length === 0) {
                bot.sendMessage(chat_id, `⚠️ No commitments found for ${username}`);
                return;
            }
            await scheduleCollection.deleteMany({
                username: username,
                startTime: {$lte: endDate},
                endTime: {$gte: startDate}
            });
            bot.sendMessage(chat_id, `✅ commitments for day ${day} deleted`);
        } else if (action === "/start" || action === "/help") {
            const keyboard = menuKeyboard("", user);
            bot.sendMessage(chat_id, `Hey @${user},\nWhat can I help u with today?`, {reply_markup: keyboard})
        }

    });

    // consume message bus for reminders
    amqp.connect(process.env.RABBITMQ_URL).then(async (connection) => {
        const channel = await connection.createChannel();

        await channel.assertExchange('reminders', 'x-delayed-message', {
            arguments: {'x-delayed-type': 'direct'}
        });

        const queue = await channel.assertQueue('reminders', {
            deadLetterExchange: 'reminders',
            deadLetterRoutingKey: 'reminders'
        });

        await channel.bindQueue(queue.queue, 'reminders', 'reminders');

        await channel.consume(queue.queue, async (message) => {
            const content = JSON.parse(message.content.toString());
            console.log(`Received a message: ${message.content.toString()}`);
            const chat_id = content.chat_id;
            const commitmentId = content.commitmentId;
            const reminderMessage = content.message;
            // check database if user has commitment at startTime (so as to avoid sending reminders for commitments that have been deleted)
            const commitment = await scheduleCollection.findOne({_id: new ObjectId(commitmentId)});
            if (commitment)
                bot.sendMessage(chat_id, reminderMessage);
            else
                console.log(`Reminder not sent - commitment of id ${commitmentId} not present in database`);
        }, {
            noAck: true // auto ack
        });
    });

    // endpoint to render roles table
    app.get('/roles', async (req, res) => {
        const roles = await rolesCollection.find().toArray();
        res.render('roles', {roles: roles});
    });

    // endpoint to render commitments table
    app.get('/commitments', async (req, res) => {
        const commitments = await scheduleCollection.find().toArray();
        res.render('commitments', {commitments: commitments});
    });
});

// Start the server on port 3001
app.listen(3001, () => {
    console.log('Server is running on port 3001');
});
