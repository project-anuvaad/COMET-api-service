const AUDIO_PROCESSOR_API_ROOT = process.env.AUDIO_PROCESSOR_API_ROOT;

module.exports = ({ rabbitmqChannel }) => {
  const exporterWorker = require("../../shared/workers/exporter")({
    rabbitmqChannel,
  });
  const transcriberWorker = require("../../shared/workers/transcriber")({
    rabbitmqChannel,
  });
  const spleeterWorker = require("../../shared/workers/spleeter")({
    rabbitmqChannel,
  });
  const audioProcessorWorker = require("../../shared/workers/audio_processor")({
    rabbitmqChannel,
    AUDIO_PROCESSOR_API_ROOT,
  });
  const whatsappBotWorker = require("../../shared/workers/whatsapp_bot")({
    rabbitmqChannel,
  });
  const automaticVideoBreakWorker = require('../../shared/workers/automatic_video_break')({ 
    rabbitmqChannel
  })

  return {
    exporterWorker,
    transcriberWorker,
    spleeterWorker,
    whatsappBotWorker,
    audioProcessorWorker,
    automaticVideoBreakWorker,
  };
};
