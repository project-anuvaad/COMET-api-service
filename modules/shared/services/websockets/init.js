const websockets = require("./websockets");
const websocketsEvents = require("./websockets/events");
const registerSocketHandlers = require("./websockets/registerHandlers");

module.exports = (server) => {
  const { ioSubscriber, ioEmitter } = websockets.createSocketConnection(
    server,
    { path: "/socket.io" }
  );

  ioSubscriber.on("connection", (socket) => {
    console.log("client connected", socket.id);
    setTimeout(() => {
      console.log("sending heartbeat to ", socket.id);
      socket.emit(websocketsEvents.HEARTBEAT, { hello: "world" });
    }, 1000);
    // Initialize handlers
    registerSocketHandlers.registerHandlers(
      socket,
      require("./websocketsHandlers").handlers
    );
  });

  ioEmitter.redis.on("error", (err) => {
    console.log("Redis error, shutting down service", err);
    process.exit(1);
  });

  ioEmitter.redis.on("end", () => {
    console.log("Redis connection closed, shutting down service");
    process.exit(1);
  });
};
