// const { ioEmitter } = require('')
const websockets = require('./websockets');
const userService = require('../user');
const socketConnectionService = require('../socketConnection');

class WebsocketsService {
  emitEvent({ email, _id, room, event, data }) {
    const ioEmitter = websockets.getEmitter();
    let q;
    if (email) {
      q = userService.find({ email });
    } else if (_id) {
      q = userService.find({ _id });
    } else if (room) {
      ioEmitter.to(room).emit(event, data);
      return console.log({ success: true });
    }
    q.then((users) => {
      if (!users || users.length === 0) throw new Error("Invalid user ");
      return socketConnectionService.find({ userId: users[0]._id });
    })
      .then((socketConnections) => {
        if (!socketConnections || socketConnections.length === 0) {
          return console.log({ online: false });
        }
        ioEmitter.to(socketConnections[0].socketId).emit(event, data);
        return console.log({ success: true, online: true });
      })
      .catch((err) => {
        console.log(err);
      });
  }
}

const websocketsService = new WebsocketsService();
module.exports = websocketsService;
