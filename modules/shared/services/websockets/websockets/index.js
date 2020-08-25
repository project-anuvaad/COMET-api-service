const io = require('socket.io');

const redis = require('socket.io-redis');
const events = require('./events');
const rooms = require('./rooms');

var ioSubscriber;
var ioEmitter = require('socket.io-emitter')({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT });
const createSocketConnection = (server, options = {}) => {
  ioSubscriber = io(server, options);
  ioSubscriber.adapter(redis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }));
  
  return {ioSubscriber, ioEmitter};
}

function getEmitter() {
  return ioEmitter;
}

module.exports = {
  ioSubscriber: ioSubscriber,
  createSocketConnection,
  ioEmitter,
  getEmitter,
  events,
  rooms,
}