const users = [];

function createUser(id) {
  users.push({
    id,
  });
}

function getUsers() {
  return users;
}

module.exports = {
  createUser,
  getUsers,
};
