const queues = require('../vendors/rabbitmq/queues');

module.exports = ({ rabbitmqChannel }) => {

    function breakVideoAutomatically({ id, url }) {
        return rabbitmqChannel.sendToQueue(queues.AUTOMATIC_BREAK_VIDEO_REQUEST_QUEUE, new Buffer(JSON.stringify({ id, url })), { persistent: true });
    }

    return {
        breakVideoAutomatically
    }

}
