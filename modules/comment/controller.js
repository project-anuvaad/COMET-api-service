const {
  articleService,
  notificationService,
  userService
} = require('../shared/services');
const async = require('async');
const Comment = require('../shared/models').Comment;
const { showMoreText, getSlideIndex, getArticleAssociatedUsers } = require('./utils');

const controller = {
  
    getArticleComments: function(req, res) {
        const { articleId } = req.params;
        const { slidePosition, subslidePosition } = req.query;
        console.log(req.query)
        let article;
        articleService.findById(articleId)
        .then((articleDoc) => {
            if (!articleDoc) throw new Error('Invalid article id');
            article = articleDoc.toObject();
            const commentQuery = {
                article: article._id,
            }
            if (slidePosition && slidePosition !== undefined) {
                commentQuery.slidePosition = parseInt(slidePosition);
            }

            if (subslidePosition && subslidePosition !== undefined) {
                commentQuery.subslidePosition = parseInt(subslidePosition);
            }
            return Comment.find(commentQuery)
        })
        .then((commentsDocs) => {
            let slidesComments = article.slides
                .reduce((acc, s) => acc.concat(s.content.map((sub) => ({ ...sub, slidePosition: s.position }))), [])
                .filter(s => s.speakerProfile && s.speakerProfile.speakerNumber !== -1)
                .map((s, index) => ({ slidePosition: s.slidePosition, subslidePosition: s.position, index, comments: [] }));
            
            commentsDocs.forEach((comment) => {
                const matchingSlide = slidesComments.find((s) => s.slidePosition === comment.slidePosition && s.subslidePosition === s.subslidePosition);
                if (matchingSlide) {
                    matchingSlide.comments.push(comment);
                }
            })
            slidesComments = slidesComments.filter(s => s.comments.length > 0);
            // Fetch comments user's data
            const fetchUsersFuncArray = [];
            slidesComments.forEach((slide) => {
                slide.comments.forEach(comment => {
                    fetchUsersFuncArray.push(cb => {
                        userService.findById(comment.user)
                        .then((userData) => {
                            comment.user = {
                                email: userData.email,
                                firstname: userData.firstname,
                                lastname: userData.lastname,
                            }
                            return cb();
                        })
                        .catch(err => {
                            comment.user = {};
                            console.log(err);
                            return cb();
                        })
                    })
                })
            })
            async.parallelLimit(fetchUsersFuncArray, 10, () => {
                return res.json({ comments: slidesComments });
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    
    addCommet: function(req, res) {

        const { articleId, slidePosition, subslidePosition, content } = req.body;
        Comment.create({ slidePosition, subslidePosition, content, article: articleId, user: req.user._id })
        .then((newComment) => {
            return res.json({ comment: newComment });
        })
        .then(() => articleService.findById(articleId))
        .then(articleDoc => {
            let article = articleDoc.toObject();
            // Send notification to associated users
            let associatedUsers = getArticleAssociatedUsers(article);
            
            const slideIndex = getSlideIndex(article, parseInt(slidePosition), parseInt(subslidePosition));
            // remove current user
            associatedUsers.filter(uid => uid !== req.user._id.toString()).forEach((userId) => {

                const notificationData = {
                    owner: userId,
                    from: req.user._id,
                    organization: article.organization,
                    type: 'added_comment_to_translation',
                    content: `${req.user.email} has added a new comment to "${article.title}" (${article.langCode}) for slide (${slideIndex + 1})`,
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
            return res.status(400).send(err.message);
        })

    }
}

module.exports = controller;
