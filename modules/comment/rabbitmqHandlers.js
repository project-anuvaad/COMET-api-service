
const Comment = require('../shared/models').Comment;
const {
    articleService,
    notificationService,
} = require('../shared/services');

const { showMoreText, getSlideIndex, getArticleAssociatedUsers } = require('./utils');
const WHATSAPP_ADD_COMMENT_QUEUE = 'WHATSAPP_ADD_COMMENT_QUEUE';

let rabbitmqChannel;

function init({ channel }) {
        rabbitmqChannel = channel;
        console.log('rabbitmq started')
        rabbitmqChannel.assertQueue(WHATSAPP_ADD_COMMENT_QUEUE, { durable: true });
        rabbitmqChannel.consume(WHATSAPP_ADD_COMMENT_QUEUE, onWhatsappAddComment, { noAck: false });

        // setTimeout(() => {
        //     rabbitmqChannel.sendToQueue(WHATSAPP_ADD_COMMENT_QUEUE, Buffer.from(JSON.stringify({
        //         articleId: '5eaa6cb57c87f000313050d2',
        //         slidePosition: 1,
        //         subslidePosition: 0,
        //         content: 'HEllo from whatsapp verifier',
        //         contactNumber: '01154854043'
        //     })), { persist: true })
        // }, 5000);
}


function parseMessageContent(msg) {
    return JSON.parse(msg.content.toString());
}

function onWhatsappAddComment(msg) {

    const { articleId, slidePosition, subslidePosition, content, contactNumber } = parseMessageContent(msg);
    const commentData = {
        isWhatsappComment: true,
        whatsappContactNumber: contactNumber,
        article: articleId,
        slidePosition,
        subslidePosition,
        content,
    }
    const fromUser = `Whatsapp Contact: ${contactNumber}`
    // CHANGE user to handle whatsapp number in vw-translate workstation
    // Change user to handle whatsapp number in notifications
    Comment.create(commentData)
        .then((newComment) => {
            console.log('Comment added via whatsapp', newComment)
            rabbitmqChannel.ack(msg)
            return articleService.findById(articleId)
        })
        .then(article => {

            let associatedUsers = getArticleAssociatedUsers(article);

            const slideIndex = getSlideIndex(article, parseInt(slidePosition), parseInt(subslidePosition));

            associatedUsers.forEach((userId) => {
                const notificationData = {
                    owner: userId,
                    organization: article.organization,
                    type: 'added_comment_to_translation',
                    content: `${fromUser} has added a new comment to "${article.title}" (${article.langCode}) for slide (${slideIndex + 1})`,
                    resource: articleId,
                    extraContent: `"${showMoreText(content, 120)}"`,
                    data: {
                        comment: true,
                        slidePosition,
                        subslidePosition,
                        slideIndex,
                    },
                    resourceType: 'article',
                }
                notificationService.notifyUser({ id: userId, organization: article.organization }, notificationData)
                    .then((data) => {
                        console.log('notified user', data);
                    })
                    .catch(err => {
                        console.log(err);
                    })
            })
        })
        .catch(err => {
            console.log(err);
            rabbitmqChannel.ack(msg)
        })
}



module.exports = {
    init,
}