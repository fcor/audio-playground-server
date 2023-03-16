const users = [];

function createUser(id) {
  users.push({
    id,
    producerId: "",
    consumerId: ""
  });
}

function getUsers() {
  return users;
}

function removeUser(id) {
  const userIndex = users.findIndex((user) => user.id === id);

  users.splice(userIndex, 1);
}

module.exports = {
  createUser,
  getUsers,
  removeUser,
  removeUser,
};
