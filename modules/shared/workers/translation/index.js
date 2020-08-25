
const queues = require('../vendors/rabbitmq/queues');

module.exports = ({ rabbitmqChannel }) => {
    
    function translateArticleText(params) {
        return rabbitmqChannel.sendToQueue(queues.TRANSLATE_ARTICLE_TEXT_QUEUE, new Buffer(JSON.stringify(params)), { persistent: true });
    }
    
    
    return {
        translateArticleText,
    }
}