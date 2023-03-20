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

function saveProducerId(userId, producerId) {
  const userIndex = users.findIndex((user) => user.id === userId);
  users[userIndex].producerId = producerId;
}
function saveConsumerId(userId, consumerId) {
  const userIndex = users.findIndex((user) => user.id === userId);
  users[userIndex].consumerId = consumerId;
}

module.exports = {
  createUser,
  getUsers,
  removeUser,
  removeUser,
  saveProducerId,
  saveConsumerId,
};
