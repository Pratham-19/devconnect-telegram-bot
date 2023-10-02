const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const addUser = async (username, team, role, language) => {
  const lang = language ?? "en";
  const user = await prisma.user.upsert({
    where: {
      username,
    },
    update: {
      team,
      role,
      lang,
    },
    create: {
      username,
      team,
      role,
      lang,
    },
  });
  return user;
};

const getUser = async (username) => {
  const user = await prisma.user.findUnique({
    where: {
      username,
    },
  });
  return user;
};

module.exports = {
  addUser,
  getUser,
};
