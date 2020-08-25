
const rabbitmqService = require('../vendors/rabbitmq');
const queues = require('../vendors/rabbitmq/queues');

module.exports = ({ rabbitmqChannel }) => {
    
    function extractVideoBackgroundMusic({ id, url }) {
        return rabbitmqChannel.sendToQueue(queues.EXTRACT_VIDEO_BACKGROUND_MUSIC_QUEUE, new Buffer(JSON.stringify({ id, url })), { persistent: true });
    }
    
    function extractVideoVoice({ id, url }) {
        return rabbitmqChannel.sendToQueue(queues.EXTRACT_VIDEO_VOICE_QUEUE, new Buffer(JSON.stringify({ id, url })), { persistent: true });
    }

    return {
        extractVideoBackgroundMusic,
        extractVideoVoice
    }
}