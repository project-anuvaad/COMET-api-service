const { RABBITMQ_SERVER, AUDIO_PROCESSOR_API_ROOT } = process.env;

module.exports = ({ rabbitmqChannel }) => {
  const exporterWorker = require("../../shared/workers/exporter")({
    rabbitmqChannel,
  });
  const audioProcessorWorker = require("../../shared/workers/audio_processor")({
    rabbitmqChannel,
    AUDIO_PROCESSOR_API_ROOT,
  });
  return {
    exporterWorker,
    audioProcessorWorker,
  };
};
