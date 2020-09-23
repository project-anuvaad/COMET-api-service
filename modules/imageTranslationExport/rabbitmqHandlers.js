const websocketsEvents = require("../shared/services/websockets/websockets/events");
const { ImageTranslationExport } = require("../shared/models");

const fs = require("fs");

const queues = require("../shared/workers/vendors/rabbitmq/queues");
let rabbitmqChannel;

function init({ channel }) {
  rabbitmqChannel = channel;

  rabbitmqChannel.assertQueue(queues.EXPORT_IMAGE_TRANSLATION_QUEUE, {
    durable: true,
  });

  rabbitmqChannel.assertQueue(queues.EXPORT_IMAGE_TRANSLATION_FINISH_QUEUE, {
    durable: true,
  });
  rabbitmqChannel.consume(
    queues.EXPORT_IMAGE_TRANSLATION_FINISH_QUEUE,
    onExportImageTranslationFinish,
    { noAck: false }
  );

  function onExportImageTranslationFinish(msg) {
    const { id, url, status } = JSON.parse(msg.content.toString());

    console.log("export image translation finish", id, url, status);
    const update = {};
    if (status === "failed") {
      update.status = "failed";
    } else {
      update.status = "done";
      update.imageUrl = url;
    }

    ImageTranslationExport.findByIdAndUpdate(id, { $set: update })
      .then(() => {
        console.log("updated image translation export", id);
        channel.ack(msg);
      })
      .catch((err) => {
        console.log(err);
        channel.ack(msg);
      });
  }
}

module.exports = {
  init,
};
