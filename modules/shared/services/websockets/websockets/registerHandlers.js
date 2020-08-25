function registerHandlers(socket, handlers) {
  handlers.forEach((handler) => {
    console.log('registering handler', handler.event, socket.id)
    socket.on(handler.event, handler.handler(socket));
  });
}

module.exports = {
  registerHandlers,
}