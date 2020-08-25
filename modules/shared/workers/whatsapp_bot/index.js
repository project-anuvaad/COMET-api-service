
const queues = require('../vendors/rabbitmq/queues');

module.exports = ({ rabbitmqChannel }) => {

    function whatsappNotifyUserVideoProofreadingReady({ videoId }) {
        return rabbitmqChannel.sendToQueue(queues.WHATSAPP_NOTIFY_USER_VIDEO_PROOFREADING_READY, new Buffer(JSON.stringify({ videoId })), { persistent: true });
    }
    
    return {
       whatsappNotifyUserVideoProofreadingReady 
    }
}