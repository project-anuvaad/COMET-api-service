const { AUDIO_PROCESSOR_API_ROOT } = process.env;

module.exports = ({ rabbitmqChannel }) => {
  const audioProcessorWorker = require("../../shared/workers/audio_processor")({
    rabbitmqChannel,
    AUDIO_PROCESSOR_API_ROOT,
  });
  return {
    audioProcessorWorker,
  }
};
