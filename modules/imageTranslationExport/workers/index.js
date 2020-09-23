module.exports = ({ rabbitmqChannel }) => {
  const exporterWorker = require("../../shared/workers/exporter")({
    rabbitmqChannel,
  });


  return {
    exporterWorker,
  };
};
