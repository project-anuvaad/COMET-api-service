const amqp = require('amqplib/callback_api');
const queues = require('./queues');
let connection = {};
let noOfConnections = 0;
function createChannel(address, callback = () => {}) {
  noOfConnections++;
  console.log('rabbimq channels ', noOfConnections)
  return new Promise((resolve, reject) => {

    if (!connection[address]) {
      amqp.connect(address, (err, conn) => {
        if (err) {
          reject(err);
          return callback(err);
        }
        connection[address] = conn;
        conn.createChannel((err, ch) => {
          if (err) {
            reject(err);
            return callback(err);
          }
          Object.keys(queues).forEach((key) => {
            const queue = queues[key];
            ch.assertQueue(queue, { durable: true });
          })
          resolve(ch);
          return callback(null, ch)
        })
      })
    } else {
      connection[address].createChannel((err, ch) => {
        if (err) {
          reject(err);
          return callback(err);
        }
        Object.keys(queues).forEach((key) => {
          const queue = queues[key];
          ch.assertQueue(queue, { durable: true });
        })
        resolve(ch);
        return callback(null, ch)
      })
    }
  })
}

module.exports = {
  createChannel,
}