const TelegramBot = require("node-telegram-bot-api");
const MongoClient = require('mongodb').MongoClient;
const amqp = require('amqplib');
const {ObjectId} = require("mongodb");
const token = process.env.BOT_TOKEN ?? "";

const bot = new TelegramBot(token, { polling: true });
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {});


// helpers
function calculateStartTime(day, shift) {
    const date = new Date(`13 Nov 2023 ${shift.startTime}`);
    date.setDate(date.getDate() + day - 1);
    return date;
}

function calculateEndTime(day, shift) {
    const date = new Date(`13 Nov 2023 ${shift.endTime}`);
    date.setDate(date.getDate() + day - 1);
    return date;
}

async function createReminder(message, date, exchange="reminders", routingKey="reminders") {
    let delay = date - Date.now();
    // delay = 60000; // 1 min

    if (delay < 0) {
        console.log('Date provided is in the past');
        return;
    }

    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(exchange, 'x-delayed-message', {
        arguments: { 'x-delayed-type': 'direct' }
    });

    const messageBuffer = Buffer.from(message);

    await channel.publish(exchange, routingKey, messageBuffer, {
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
    ADDSHIFT: "addShift",
    OTHERROLE: "otherRoles",
    ADDROLE: "addRole",
    UPDATEROLE: "updateRole",
    DELETEUSER: "delUser",
    DELETESHIFT: "delShift",
    FINDSHIFT: "findShift",
    FINDUSERS: "findUser",
    FINDALLSHIFTUSERS: "findShiftUsers",
    SWAPSHIFT: "swapShift",
}
const textKeys = {
    GETROLE: "/roleof",
    GIVEROLE: "/give",
    UPDATEROLE: "/updaterole",
    DELETEUSER: "/delrole",
    ADDSHIFT: "/addshift",
    DELETESHIFT: "/delshift",
    GETSHIFT: "/getshift",
    FINDUSERS: "/findteamusers",
    FINDALLSHIFTUSERS: "/findusers",
    SWAPSHIFT: "/swapshift",
}
const shifts = {
    1: {
        startTime: "08:30:00",
        endTime: "12:30:00"
    },
    2: {
        startTime: "13:30:00",
        endTime: "17:30:00"
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
    SHIFTS: "schedulemenu"
}

function menuKeyboard(name) {
    if (name === menu.ROLE) {
        return {
            "inline_keyboard": [
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
            ]
        };
    } else if (name === menu.SHIFTS) {
        return {
            "inline_keyboard": [
                [
                    {
                        "text": "Add shift",
                        "callback_data": keys.ADDSHIFT
                    }
                ],
                [
                    {
                        "text": "Delete shift",
                        "callback_data": keys.DELETESHIFT
                    }
                ],
                [
                    {
                        "text": "Get shifts",
                        "callback_data": keys.FINDSHIFT
                    }
                ],
                [
                    {
                        "text": "Find users by shift & your team",
                        "callback_data": keys.FINDUSERS
                    }
                ],
                [
                    {
                        "text": "Find users by shifts",
                        "callback_data": keys.FINDALLSHIFTUSERS
                    }
                ],
                [
                    {
                        "text": "Swap shift with your teammate",
                        "callback_data": keys.SWAPSHIFT
                    }
                ],
            ]
        }
    } else {
        return {
            "inline_keyboard": [
                [
                    {
                        "text": "Roles",
                        "callback_data": menu.ROLE
                    }
                ],
                [
                    {
                        "text": "Schedule",
                        "callback_data": menu.SHIFTS
                    }
                ],
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
        let keyboard;

        switch (action) {
            case menu.ROLE:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                keyboard = menuKeyboard(menu.ROLE);
                await bot.sendMessage(opts.chat_id, 'What role function do you want to use?', {reply_markup: keyboard});
                break;
            case menu.SHIFTS:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                keyboard = menuKeyboard(menu.SHIFTS);
                await bot.sendMessage(opts.chat_id, 'What schedule function do you want to use?', {reply_markup: keyboard});
                break;
            case keys.DELETESHIFT:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to delete shift\n\n${textKeys.DELETESHIFT} username, day(13-20)\n\ne.g ${textKeys.DELETESHIFT} @bugbyt, 14`);
                break;
            case keys.SWAPSHIFT:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to swap shift with teammate\n\n${textKeys.SWAPSHIFT} user1, user2, day1(13-20), day2(13-20)\n\ne.g ${textKeys.SWAPSHIFT} @bugbyt, @kokocares, 14, 16\n${textKeys.SWAPSHIFT} @bugbyt, @kokocares, 14, 14 (for same day swap)`);
                break;
            case keys.FINDUSERS:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to find users of your team on particular shift,\n1 - morning shift,\n2 - afternoon shift\n\n${textKeys.FINDUSERS} username, day(13-20), shift(1,2)\n\ne.g ${textKeys.FINDUSERS} @bugbyt, 14, 2`);
                break;
            case keys.FINDALLSHIFTUSERS:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to find users by shift,\n1 - morning shift,\n2 - afternoon shift\n\n${textKeys.FINDALLSHIFTUSERS} day(13-20), shift(1,2)\n\ne.g ${textKeys.FINDALLSHIFTUSERS} 14, 2`);
                break;
            case keys.FINDSHIFT:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to find shifts\n\n${textKeys.GETSHIFT} username\n\ne.g ${textKeys.GETSHIFT} @bugbyt`);
                break;
            case keys.ADDROLE:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to add role\n\n${textKeys.GIVEROLE} username, team, role, spoken language\n\ne.g ${textKeys.GIVEROLE} @bugbyt, Co-Working Team, Volunteer, English`);
                break;
            case keys.OTHERROLE:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to get other's role\n\n${textKeys.GETROLE} username\n\ne.g ${textKeys.GETROLE} @bugbyt`);
                break;
            case keys.UPDATEROLE:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to update role\n\n${textKeys.UPDATEROLE} username, team, role\n\ne.g ${textKeys.UPDATEROLE} @bugbyt, Co-Working Team, Volunteer`);
                break;
            case keys.DELETEUSER:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to delete role\n\n${textKeys.DELETEUSER} username\n\ne.g ${textKeys.DELETEUSER} @bugbyt`);
                break;
            case keys.ADDSHIFT:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, `Use the following command to add shift,\n1 - morning shift,\n2 - afternoon shift\n\n${textKeys.ADDSHIFT} username, day(13-20), Shift (1,2)\n\ne.g ${textKeys.ADDSHIFT} @bugbyt, 15, 2 `);
                break;
            case keys.MYROLE:
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, opts);
                await bot.sendMessage(opts.chat_id, `Getting @${user}'s role`);
                const username = `@${user}`;
                const foundUser = await rolesCollection.findOne({ username: username });
                if (foundUser) {
                    await bot.sendMessage(opts.chat_id, `${foundUser.username} is in ${foundUser.team} as ${foundUser.role}`);
                } else {
                    await bot.sendMessage(opts.chat_id, `No role assigned to @${user}`);
                }
                break;
            default:
                await bot.editMessageReplyMarkup({inline_keyboard: []}, opts);
                await bot.sendMessage(opts.chat_id, "❌ Invalid response retry!");
                break;
        }
    });

    bot.on("message", async (msg) => {
        const chat_id = msg.chat.id;
        const user = msg.from.username;
        const text = msg.text;

        const action = text.split(" ")[0].toLowerCase()

        if (action === textKeys.GETROLE) {
            const username = text.split(" ")[1];
            await bot.sendMessage(chat_id, `Getting ${username}'s role`);
            const user = await rolesCollection.findOne({ username: username });
            if (user) {
                await bot.sendMessage(chat_id, `${user.username} is in ${user.team} as ${user.role}`);
            } else {
                await bot.sendMessage(chat_id, `No role assigned to ${username}`);
            }
        } else if (action === textKeys.GETSHIFT) {
            let msg = text.split(" ");
            const username = msg[1].trim();
            let shifts = await scheduleCollection.find({ username: username }).toArray();
            if (shifts && shifts.length !== 0) {
                await bot.sendMessage(chat_id, "--- Your Shifts ---");
                shifts.forEach(async s =>
                    await bot.sendMessage(chat_id, `Start Time: ${s.startTime.toLocaleString()}\nEnd Time: ${s.endTime.toLocaleString()}`)
                );
                await bot.sendMessage(chat_id, "   ---   ");
            } else {
                await bot.sendMessage(chat_id, `No shifts found for ${username}`);
            }
        } else if (action === textKeys.FINDUSERS) {
            // TODO: find users by shift and your team
            await bot.sendMessage(chat_id, "Coming soon");
        } else if (action === textKeys.SWAPSHIFT) {
            let msg = text.split(',');
            let user1 = msg[0].split(" ")[1].trim();
            let user2 = msg[1].trim();
            let day1 = parseInt(msg[2].trim());
            let day2 = parseInt(msg[3].trim());
            let user1Role = await rolesCollection.findOne({ username: user1 });
            let user2Role = await rolesCollection.findOne({ username: user2 });
            if (user1Role && user2Role) {
                if (user1Role.team === user2Role.team && user1Role.role === user2Role.role) {
                    let shifts1 = await scheduleCollection.find({ username: user1, startTime: { $gte: new Date(`2023-11-${day1}T00:00:00`), $lte: new Date(`2023-11-${day1}T23:59:59`) } });
                    let shifts2 = await scheduleCollection.find({ username: user2, startTime: { $gte: new Date(`2023-11-${day2}T00:00:00`), $lte: new Date(`2023-11-${day2}T23:59:59`) } });
                    if (shifts1 && shifts2) {
                        // swap shifts
                        await scheduleCollection.updateMany({ username: user1, startTime: { $gte: new Date(`2023-11-${day1}T00:00:00`), $lte: new Date(`2023-11-${day1}T23:59:59`) } }, { $set: { username: user2 } });
                        await scheduleCollection.updateMany({ username: user2, startTime: { $gte: new Date(`2023-11-${day2}T00:00:00`), $lte: new Date(`2023-11-${day2}T23:59:59`) } }, { $set: { username: user1 } });
                        await bot.sendMessage(chat_id, "✅ Shifts swapped successfully");
                    } else {
                        await bot.sendMessage(chat_id, "⚠️ No shift assigned to user on specified day");
                    }
                } else {
                    await bot.sendMessage(chat_id, "Can't swap with different team/role user");
                }
            } else {
                await bot.sendMessage(chat_id, "⚠️ No role assigned to user");
            }
        } else if (action === textKeys.FINDALLSHIFTUSERS) {
            // TODO: find all users by shift
            await bot.sendMessage(chat_id, "Coming soon");
        } else if (action === textKeys.ADDSHIFT) {
            let msg = text.split(',');

            if (msg.length !== 3) {
                await bot.sendMessage(chat_id, "❌ Invalid format!");
            } else {
                const username = msg[0].split(" ")[1].trim();
                const day = days[msg[1].trim()];
                const shift = shifts[msg[2].trim()];
                const role = await rolesCollection.findOne({ username: username });
                if (!role) {
                    await bot.sendMessage(chat_id, "⚠️ Assign a role to add shift!");
                } else {
                    const startTime = calculateStartTime(day, shift);
                    const endTime = calculateEndTime(day, shift);
                    const overlap = await scheduleCollection.findOne({ username: username, startTime: { $lte: endTime }, endTime: { $gte: startTime } });
                    if (overlap) {
                        await bot.sendMessage(chat_id, "⚠️ Shift already exists!");
                    } else {
                        // add shift to existing list of shifts for user
                        const newShift = await scheduleCollection.insertOne({ username: username, startTime: startTime, endTime: endTime });
                        await bot.sendMessage(chat_id, "✅ Added Successfully");
                        console.log("Inserted a new shift with id: " + newShift.insertedId)

                        // create reminder for shift 1 day before
                        const reminderMessage = `Hey ${username}, you have an upcoming shift at ${startTime.toLocaleString()}`;
                        const reminderDate = startTime - 86400000;
                        await createReminder(JSON.stringify({ chat_id: chat_id, shiftId: newShift.insertedId, message: reminderMessage }), reminderDate);

                        // create reminder for shift 1 hour before
                        const reminderMessage2 = `Hey ${username}, you have an upcoming shift at ${startTime.toLocaleString()}`;
                        const reminderDate2 = startTime - 3600000;
                        await createReminder(JSON.stringify({ chat_id: chat_id, shiftId: newShift.insertedId, message: reminderMessage2 }), reminderDate2);
                    }
                }
            }
        } else if (action === textKeys.GIVEROLE) {
            let msg = text.split(',');

            if (msg.length !== 4) {
                await bot.sendMessage(chat_id, "❌ Invalid format!");
                return;
            }

            const username = msg[0].split(" ")[1].trim();
            const team = msg[1].trim();
            const role = msg[2].trim();
            const language = msg[3].trim();

            const existingUser = await rolesCollection.findOne({ username: username });
            if (existingUser) {
                await bot.sendMessage(chat_id, "⚠️ Role exists");
                await bot.sendMessage(chat_id, `${existingUser.username} is in ${existingUser.team} as ${existingUser.role}`);
            } else {
                const newUser = { username: username, team: team, role: role, language: language };
                await rolesCollection.insertOne(newUser);
                await bot.sendMessage(chat_id, "✅ Added Successfully");
            }
        } else if (action === textKeys.UPDATEROLE) {
            let msg = text.split(',');
            const username = msg[0].split(" ")[1].trim();
            const team = msg[1].trim();
            const role = msg[2].trim();
        
            const existingUser = await rolesCollection.findOne({ username: username });
            if (existingUser) {
                if (msg.length === 3) {
                    await rolesCollection.updateOne({ username: username }, { $set: { team: team, role: role } });
                    await bot.sendMessage(chat_id, "✅ Updated Successfully");
                } else {
                    await bot.sendMessage(chat_id, "❌ Invalid response retry!");
                }
            } else {
            await bot.sendMessage(chat_id, "⚠️ No user found");
            }
        } else if (action === textKeys.DELETEUSER) {
            const username = text.split(" ")[1];
            const result = await rolesCollection.deleteOne({ username: username });
            if (result.deletedCount > 0) {
                await bot.sendMessage(chat_id, `✅ user deleted`);

                // delete all shifts for user
                await scheduleCollection.deleteMany({ username: username });
            } else {
                await bot.sendMessage(chat_id, `⚠️ No user found`);
            }
        } else if (action === textKeys.DELETESHIFT) {
            let msg = text.split(" ");
            const username = msg[1].trim().split(",")[0].trim();
            const day = parseInt(msg[2].trim());
            const startDate = new Date(`${day} Nov 2023 00:00:00`)
            const endDate = new Date(`${day} Nov 2023 23:59:59`)
            const shiftsForUser = await scheduleCollection.find({ username: username, startTime: { $lte: endDate }, endTime: { $gte: startDate } }).toArray();
            if (shiftsForUser.length === 0) {
                await bot.sendMessage(chat_id, `⚠️ No shifts found for ${username}`);
                return;
            }
            await scheduleCollection.deleteMany({ username: username, startTime: { $lte: endDate }, endTime: { $gte: startDate } });
            await bot.sendMessage(chat_id, `✅ shifts for day ${day} deleted`);
        } else if (action === "/start" || action === "/help") {
            const keyboard = menuKeyboard("");
            await bot.sendMessage(chat_id, `Hey @${user},\nWhat can I help u with today?`, {reply_markup: keyboard})
        }

    });

    // consume message bus for reminders
    amqp.connect(process.env.RABBITMQ_URL).then(async (connection) => {
        const channel = await connection.createChannel();

        await channel.assertExchange('reminders', 'x-delayed-message', {
            arguments: { 'x-delayed-type': 'direct' }
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
            const shiftId = content.shiftId;
            const reminderMessage = content.message;
            // check database if user has shift at startTime (so as to avoid sending reminders for shifts that have been deleted)
            const shift = await scheduleCollection.findOne({ _id: new ObjectId(shiftId) });
            if (shift)
                await bot.sendMessage(chat_id, reminderMessage);
            else
                console.log(`Reminder not sent - shift of id ${shiftId} not present in database`);
        }, {
            noAck: true // auto ack
        });
    });
});
