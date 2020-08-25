const queues = require('../shared/workers/vendors/rabbitmq/queues');
const {
    websocketsService,
} = require('../shared/services');
const websocketsEvents = require('../shared/services/websockets/websockets/events');
const websocketsRooms = require('../shared/services/websockets/websockets/rooms');
// const translatioService = require('../shared/services/translation')
const NoiseCancellationVideo = require('../shared/models').NoiseCancellationVideo;

let rabbitmqChannel;

function init(channel) {
    rabbitmqChannel = channel;
    rabbitmqChannel.prefetch(1);
    rabbitmqChannel.assertQueue(queues.PROCESS_NOISECANCELLATIONVIDEO_AUDIO_FINISHED_QUEUE, { durable: true });
    rabbitmqChannel.consume(queues.PROCESS_NOISECANCELLATIONVIDEO_AUDIO_FINISHED_QUEUE, onProcessNoiseCancellationFinish, { noAck: false });
}

function onProcessNoiseCancellationFinish(msg) {
  const { id, url, status } = JSON.parse(msg.content.toString());
  rabbitmqChannel.ack(msg);
  NoiseCancellationVideo.findByIdAndUpdate(id, { noiseCancelledUrl: url, status })
  .then(() => NoiseCancellationVideo.findById(id))
  .then((doc) => {
      const noiseCancellationVideo = doc.toObject()
      websocketsService.emitEvent({ room: websocketsRooms.getOrganizationRoom(noiseCancellationVideo.organization), event: websocketsEvents.NOISE_CANCELLATION_VIDEO_FINISH, data: { noiseCancellationVideo }  })
  })
  .catch(err => {
      console.log('onProcessNoiseCancellationFinish error', err);
  })
}

module.exports = {
    init,
}
