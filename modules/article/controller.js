const uuid = require('uuid').v4;
const async = require('async');
const utils = require('./utils');
const Article = require('../shared/models').Article;
const AUTOMATIC_BREAK_SLIDE_DURATION = 15;

const {
    videoService,
    commentService,
    userService,
    organizationService,
    authService,
    notificationService,
    emailService
} = require('../shared/services');

const { isoLangs } = require('./constants/langs');

const {
    validateSubslideDelete,
    validateSubslideUpdate,
    validateSpeakersProfileUpdate,
    validateTranslatorsUpdate,
    validateAddSubslide,
    generateWhatsappTranslateLink,
    getArticlesWithRelatedUsers,
    getArticleWithRelatedUsers,
} = require('./utils');
const { Video, Comment } = require('../shared/models');

const controller = {
    getArticles: function(req, res) {
        Article.find(req.query)
        .then((articles) => {
            return res.json({ articles });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    getById: function (req, res) {
        const { articleId } = req.params;
        Article.findById(articleId)
            .then((article) => {
                if (!article) {
                    return res.send(null);
                }
                return res.json({ article: article });
            })
            .catch((err) => {
                console.log('error', err);
                return res.status(400).send('Something went wrong');
            })
    },
    deleteArticle: function(req, res) {
        const { articleId } = req.params;
        // let article
        Article.findById(articleId)
        .then(() => {
            // article = articleDoc;
            return Article.remove({ _id: articleId })
        })
        .then(() => {
            return res.json({ success: true });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    getArticleComments: function(req, res) {
        const { articleId } = req.params;
        // const { slidePosition, subslidePosition } = req.query;
        let slidesSubslidesPositions = [];
        if (req.query.slides) {
            if (Array.isArray(req.query.slides)) {
                slidesSubslidesPositions = req.query.slides;
            } else {
                slidesSubslidesPositions = req.query.slides.split(',');
            }
        }
        let article;
        Article.findById(articleId)
        .then((articleDoc) => {
            if (!articleDoc) throw new Error('Invalid article id');
            article = articleDoc.toObject();
            return new Promise((resolve, reject) => {

                if (slidesSubslidesPositions.length > 0) {
                    if (slidesSubslidesPositions.length === 1) {
                        const commentQuery = {
                            article: article._id,
                        }
                        const [ slidePosition, subslidePosition ] = slidesSubslidesPositions[0].split('-');
                        commentQuery['slidePosition'] = parseInt(slidePosition);
                        commentQuery['subslidePosition'] = parseInt(subslidePosition)
                        return Comment.find(commentQuery)
                            .populate('user', '_id email firstname lastname')
                            .then(resolve)
                            .catch(reject)
                    } else {
                        const fetchCommentFuncArray = [];
                        const comments = [];
                        slidesSubslidesPositions.forEach((sb) => {
                            fetchCommentFuncArray.push(cb => {
                                const commentQuery = {
                                    article: article._id,
                                }
                                const [ slidePosition, subslidePosition ] = sb.split('-');
                                commentQuery['slidePosition'] = parseInt(slidePosition);
                                commentQuery['subslidePosition'] = parseInt(subslidePosition)
                                Comment.find(commentQuery)
                                .populate('user', '_id email firstname lastname')
                                    .then(commentsDocs => {
                                        commentsDocs.forEach(doc => {
                                            comments.push(doc.toObject());
                                        })
                                        cb();
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        cb();
                                    })
                                        
                            })
                        })
                        async.parallelLimit(fetchCommentFuncArray, 10, () => {
                            return resolve(comments);
                        })
                    }
                }
                
            })
        })
        .then((commentsDocs) => {
            return new Promise((resolve) => {
                commentsDocs = commentsDocs.map(c => c);

                const slidesComments = article.slides
                .reduce((acc, s) => acc.concat(s.content.map((sub) => ({ ...sub, slidePosition: s.position }))), [])
                .filter(s => s.speakerProfile && s.speakerProfile.speakerNumber !== -1)
                .map((s, index) => ({ slidePosition: s.slidePosition, subslidePosition: s.position, index, comments: [] }));
            
                commentsDocs.forEach((comment) => {
                    const matchingSlide = slidesComments.find((s) => s.slidePosition === comment.slidePosition && s.subslidePosition === comment.subslidePosition);
                    if (matchingSlide) {
                        matchingSlide.comments.push(comment);
                    }
                })
                const filteredSliesComments = slidesComments.filter(s => s.comments.length > 0).map((s, index) => ({ ...s, index }))
                // FETCH USER INFO FOR COMMENTS
                const fetchCommentUserFunArray = [];
                filteredSliesComments.forEach(slide => {
                    slide.comments.forEach(comment => {
                        if (comment.user) {
                            fetchCommentUserFunArray.push(cb => {
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
                                    console.log(err);
                                    return cb();
                                })
                            })
                        }
                    })

                });

                async.parallelLimit(fetchCommentUserFunArray, 10, (err) => {
                    if (err) {
                        console.log(err);
                    }
                    return resolve(filteredSliesComments);
                })
            })
        })
        .then(comments => {
            return res.json({ comments });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    getByVideoId: function (req, res) {
        const { videoId } = req.query;
        let video;
        videoService.findById(videoId)
        .then((videoDoc) => {
            video = videoDoc;
            return Article.findById(video.article)
        })
        .then((article) => {
            if (article) {
                return res.json(article);
            }
            
            let targetArticle;
            // FIX OLD BUG for backward compatibility
            Article.find({ video: videoId })
            .then((articles) => {
                if (!articles || articles.length === 0) {
                    throw new Error('Somthing went wrong, no articles found for a video', videoId)
                }
                targetArticle = articles[0].toObject();
                let articleChanged = false;
                let articleChanges = {}
                if (!targetArticle.slides || targetArticle.slides.length === 0 ) {
                    articleChanged = true;
                    const initialSlide = {
                        position: 0,
                        content: [{
                            text: '',
                            position: 0,
                            startTime: 0,
                            endTime: video.duration,
                            speakerProfile: {
                                speakerNumber: 1,
                                speakerGender: 'male',
                            }
                        }]
                    }
                    targetArticle.slides = [initialSlide]
                    articleChanges.slides = targetArticle.slides;
                }
                if (!targetArticle.speakersProfile || targetArticle.speakersProfile.length == 0) {
                    articleChanged = true;
                    targetArticle.speakersProfile = [{
                        speakerNumber: 1,
                        speakerGender: 'male',
                    }];
                    articleChanges.speakersProfile = targetArticle.speakersProfile;
                }
                if (articleChanged) {
                    Article.update({ _id: targetArticle._id }, { $set: articleChanges })
                    .then(() => {
                        console.log('Fixed article slides and speakerProfile')
                    })
                    .catch(err => {
                        console.log('erro fixing article slides and speakers profile', err);
                    })
                }

                return videoService.updateById(videoId, { article: targetArticle._id })
            })
            .then(() => {
                return res.json(targetArticle);
            })
            .catch(err => {
                console.log(err);
                return res.send(null);
            })
        })
        .catch((err) => {
            console.log('error', err);
            return res.status(400).send('Something went wrong');
        })
    },

    addSubslide: function (req, res) {
        const { articleId, slidePosition, subslidePosition } = req.params;
        const { text, startTime, endTime, speakerProfile } = req.body;
        let article;
        Article.findById(articleId)
            .then((a) => {
                if (!a) return res.status(400).send('Invalid article id');
                article = a.toObject();
                return videoService.findById(article.video)
            })
            .then(video => {
                const { valid, message } = validateAddSubslide(article, slidePosition, subslidePosition, startTime, endTime, speakerProfile);
                if (!valid) {
                    throw new Error(message)
                }
                if (endTime > video.duration) {
                    throw new Error('Slide end time can\'t be larger than the video duration')
                }
                return utils.addSubslide(articleId, slidePosition, subslidePosition, { text, startTime, endTime, speakerProfile });
            })
            .then(() => {
                return Article.findById(articleId);
            })
            .then((article) => {
                return res.json({ article });
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send(err.message || 'Something went wrong');
            })
    },

    updateSubslide: function (req, res) {
        const { articleId, slidePosition, subslidePosition } = req.params;
        const changes = req.body;
        Article.findById(articleId)
            .then((article) => {
                if (!article) return res.status(400).send('Invalid article');
                article = article.toObject();
                const { valid, message } = validateSubslideUpdate(article, slidePosition, subslidePosition, changes);
                if (!valid) {
                    throw new Error(message || 'Something went wrong');
                }
                if (changes.text && changes.text !== article.slides.find(s => s.position === parseInt(slidePosition)).content.find(s => s.position === parseInt(subslidePosition)).text) {
                    changes.transcriptionVersionArticleId = null;
                }
                return utils.updateSubslideUsingPosition(articleId, slidePosition, subslidePosition, changes);
            })
            .then((changes) => {
                return res.json({ articleId, slidePosition, subslidePosition, changes });
            })
            .catch((err) => {
                console.log(err);
                return res.status(400).send(err.message);
            })
    },

    splitSubslide: function(req, res) {
        const { articleId, slidePosition, subslidePosition } = req.params;
        const { wordIndex, time } = req.body;
        utils.splitSubslide(articleId, slidePosition, subslidePosition, wordIndex, time)
        .then(() => {
            return Article.findById(articleId)
        })
        .then((article) => {
            return res.json({ article });
        })
        .catch(err => {
            return res.status(400).send(err.message);
        })
    },

    deleteSubslide: function (req, res) {
        const { articleId, slidePosition, subslidePosition } = req.params;
        const changes = req.body;
        Article.findById(articleId)
            .then((article) => {
                if (!article) return res.status(400).send('Invalid article');
                article = article.toObject();
                const { valid, message } = validateSubslideDelete(article, slidePosition, subslidePosition, changes);
                if (!valid) {
                    throw new Error(message || 'Something went wrong');
                }
                return utils.removeSubslide(articleId, slidePosition, subslidePosition);
            })
            .then(() => Article.findById(articleId))
            .then((article) => {
                return res.json({ article });
            })
            .catch((err) => {
                console.log(err);
                return res.status(400).send(err.message);
            })
    },

    replaceArticleText: function(req, res) {
        const { articleId } = req.params;
        const { find, replace } = req.body;
        Article.findById(articleId)
            .then(() => {

                return utils.replaceArticleSlidesText(articleId, { find, replace })
            })
            .then(() => {
                // changedSlides.forEach(({ slidePosition, subslidePosition, text }) => {
                //     websocketsService.ioEmitter.to(websocketsRooms.getOrganizationRoom(article.organization)).emit(`${events.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`, { slidePosition, subslidePosition, changes: { text, audioSynced: false } });
                // })
                return Article.findById(articleId);
            })
            .then((article) => {
                return res.json({ article: utils.cleanArticleSilentAndBackgroundMusicSlides(article)})
            })
            .catch((err) => {
                console.log(err);
                return res.status(400).send('Something went wrong');
            })
            .then(() => {
                Article.update({ _id: articleId }, { $set: { exported: false } })
                .then(() => {

                })
                .catch(err => {
                    console.log('error updating article exported', err);
                })
            })
    },
    subscribeAITranscribeFinish: function(req, res) {
        const { articleId } = req.params;
        const user = req.user;
        Article.findById(articleId)
        .then(() => {
           return Article.findByIdAndUpdate(articleId, { $addToSet: { AITranscriptionFinishSubscribers: user._id }})
        })
       .then(() => {
           return res.json({ success: true });
        }) 
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },
    automaticBreakArticle: function(req, res) {
        const { articleId } = req.params;
        let article;
        let video;
        let defaultSpeakerProfile;
        Article.findById(articleId)
        .then(a => {
            article = a.toObject();
            defaultSpeakerProfile = article.speakersProfile && article.speakersProfile[0] ? article.speakersProfile[0] : {
                speakerNumber: 1,
                speakerGender: 'male'
            } ;
            return videoService.findById(article.video)
        })
        .then(v => {
            video = v;
            if (!video.duration) {
                throw new Error('This feature is not available for this video');
            }
            let slides = [];
            let consumedDuration = 0;
            while ((consumedDuration + AUTOMATIC_BREAK_SLIDE_DURATION) <= video.duration) {
                slides.push({
                    content: [
                        {
                            position: 0,
                            startTime: consumedDuration,
                            endTime: consumedDuration + AUTOMATIC_BREAK_SLIDE_DURATION,
                            speakerProfile: defaultSpeakerProfile,
                        }
                    ]
                })
                consumedDuration += AUTOMATIC_BREAK_SLIDE_DURATION;
            }
            // Create a last slide till the end of the video
           if (consumedDuration < video.duration) {
                slides.push({
                    content: [
                        {
                            position: 0,
                            startTime: consumedDuration,
                            endTime: video.duration,
                            speakerProfile: defaultSpeakerProfile,
                            text: '',
                            audio: '',
                        }
                    ]
                })
           } 
           slides = slides.map((s, i) => ({ ...s, position: i }))
           return Article.findByIdAndUpdate(articleId, { $set: { slides }})
            .then(() => Article.findById(articleId))
            .then(a => {
                return res.json({ article: a.toObject() });
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send('Something went wrong');
            })
        })
        .catch(err => {
            console.log(err);
            res.status(400).send(err.message)
        })
    },

    updateSpeakersProfile: function (req, res) {
        const { speakersProfile } = req.body;
        const { articleId } = req.params;

        const { valid, message } = validateSpeakersProfileUpdate(speakersProfile);
        if (!valid) {
            return res.status(400).send(message || 'Something went wrong');
        }
        Article.update({ _id: articleId }, { $set: { speakersProfile } })
            .then(() => {
                return videoService.update({ _id: articleId }, { numberOfSpeakers: speakersProfile.length })
            })
            .then(() => {
                return res.json({ speakersProfile })
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send('Something went wrong');
            })
    },

    updateToEnglish: function(req, res) {
        const { articleId } = req.params;
        const { toEnglish } = req.body;
        Article.update({ _id: articleId }, { $set: { toEnglish } })
        .then(() => {
            return res.json({ toEnglish });
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    updateReviewCompleted: function(req, res) {
        const { articleId } = req.params;
        const { reviewCompleted } = req.body;
        let video;
        let article;
        Article.findById(articleId)
        .then(a => {
            article = a;
            return Article.update({ _id: articleId }, { $set: { reviewCompleted } })
        })
        .then(() => {
            res.json({ reviewCompleted });
            return videoService.findByIdAndUpdate(article.video, { reviewCompleted });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                videoService.findById(article.video)
                .then((videoDoc) => {
                    video = videoDoc;
                    return organizationService.findById(video.organization)
                })
                .then(organization => {
                    video.organization = organization;
                    // Fetch verifiers
                    const fetchVerifiersFuncArray = video.verifiers.map(verifier => cb => {
                        userService.findById(verifier)
                        .then((userData) => {
                            return cb(null, userData);
                        })
                        .catch(() => {
                            return cb();
                        })
                    });

                    async.parallelLimit(fetchVerifiersFuncArray, 10, (err, data) => {
                        video.verifiers = data;
                        resolve(video)
                    })
                })
                .catch(reject)
            })
        })
        .then((video) => {
            video.verifiers.forEach((verifier) => {
                const notificationData = {
                    owner: verifier._id,
                    organization: video.organization._id,
                    from: req.user._id,
                    type: 'review_marked_as_done',
                    content: `${req.user.email} has marked the video "${video.title}" as done and ready to be verified`,
                    resource: video._id,
                    resourceType: 'video',
                    hasStatus: false,
                }
                notificationService.notifyUser({
                    email: verifier.email,
                    organization: video.organization,
                }, notificationData)
                .then(() => {
                   return authService.generateLoginToken(verifier._id)
                   
                })
                .then(token => {
                    return emailService.notifyUserReviewMarkedDone({
                        from: req.user,
                        to: verifier,
                        organizationName: video.organization.name,
                        organizationId: video.organization._id,
                        videoTitle: video.title,
                        videoId: video._id,
                        inviteToken: token,
                    })
                })
                .then(() => {
                    console.log('sent invitation email')
                })
                .catch(err => {
                    console.log('error sending notification', err, notificationData);
                })
            })
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    
    updateTranslators: function(req, res) {
        const { translators } = req.body;
        const { articleId } = req.params;
        const newTranslators = [];
        const { valid, message } = validateTranslatorsUpdate(translators);
        if (!valid) {
            return res.status(400).send(message || 'Something went wrong');
        }
        let finalTranslators = [];
        let removedTranslators = [];
        let article;
        Article.findById(articleId)
        .then((articleDoc) => {
            article = articleDoc.toObject();
            
            if (translators.length > 0) {
                // Collect removed translators
                let newTranslatorsIds = translators.map(t => t.user);
                article.translators.forEach((translator) => {
                    if (newTranslatorsIds.indexOf(translator.user.toString()) === -1 || translators.find(t => t.user === translator.user.toString()).speakerNumber !== translator.speakerNumber) {
                        removedTranslators.push(translator);
                    }
                })
                translators.forEach((translator) => {
                    if (!articleDoc.translators.some((t) => t.speakerNumber === translator.speakerNumber && t.user.toString() === translator.user)) {
                        translator.inviteToken = `${uuid()}-${uuid()}`;
                        finalTranslators.push({
                            user: translator.user,
                            speakerNumber: translator.speakerNumber,
                            inviteToken: translator.inviteToken,
                            invitedBy: req.user._id,
                        })
                        newTranslators.push(translator)
                    } else {
                        finalTranslators.push(translator)
                    }
                })
            } else {
                article.translators.forEach((t) => {
                    removedTranslators.push(t);
                })
            }
            return Article.update({ _id: articleId }, { $set: { translators: finalTranslators } })
        })
        .then(() => {
            return getArticleWithRelatedUsers(articleId);
        })
        .then((articleDoc) => {
            let translators = articleDoc.translators.map(t => ({ ...t, inviteToken: '' }));
            return res.json({ translators })
        })
        // Fetch video and organization
        .then(() => {
            return new Promise((resolve, reject) => {
                videoService.findById(article.video)
                .then((videoDoc) => {
                    article.video = videoDoc;
                    return organizationService.findById(article.organization)
                })
                .then(organizationDoc => {
                    article.organization = organizationDoc;
                    resolve();
                })
                .catch(reject);
            })
        })
        .then(() => {
            return new Promise((resolve) => {
                // Remove pending invitation notifications from removed translators
                if (removedTranslators.length === 0) return resolve();
                const removeNotiFuncArray = [];
                removedTranslators.forEach((translator) => {
                    removeNotiFuncArray.push((cb) => {

                        const notiQuery = {
                            owner: translator.user,
                            organization: article.organization._id,
                            status: 'pending',
                            resource: articleId 
                        }
                        notificationService.remove(notiQuery)
                        .then(() => {
                            cb();
                        })
                        .catch(err => {
                            console.log('err removing pending notifications', err);
                            cb()
                        })
                    })
                })
                async.parallel(removeNotiFuncArray, () => {
                    resolve();
                })
            })
        })
        .then(() => {
            if (newTranslators.length === 0) return;
            // Send email invitation and notification to new translators
            newTranslators.filter(t => t.user !== req.user._id.toString()).forEach((translator) => {
                const speakerTimingSeconds = article.slides
                                            .reduce((acc, s) => acc.concat(s.content), [])
                                            .filter(s => s.speakerProfile && s.speakerProfile.speakerNumber === translator.speakerNumber)
                                            .reduce((acc, s) => acc + ((s.endTime - s.startTime) || 0), 0)
                const speakerTimingMinutes = parseFloat(speakerTimingSeconds/60).toFixed(1);
                const fromLang = isoLangs[article.video.langCode.split('-')[0]].name;
                const toLang = article.langName || isoLangs[article.langCode.split('-')[0]].name;
                const extraContent = `This video requires you to add voice-overs for "${speakerTimingMinutes}" minutes, taking approximately "${parseFloat(speakerTimingMinutes * 15).toFixed(1)}" minutes of time`;

                let user;
                userService.findById(translator.user)
                .then((userData) => {
                    user = userData;
                    return authService.generateLoginToken(user._id);

                })
                .then(() => {
                    const notificationData = {
                        owner: user._id,
                        organization: article.organization._id,
                        from: req.user._id,
                        type: 'invited_to_translate',
                        content: `${req.user.email} has invited you to translate the video "${article.title}" (${article.langCode}) for speaker (${translator.speakerNumber})`,
                        extraContent,
                        resource: articleId,
                        resourceType: 'article',
                        hasStatus: true,
                        status: 'pending',
                        inviteToken: translator.inviteToken,
                    }
                    notificationService.notifyUser({ email: user.email, organization: article.organization._id }, notificationData)
                    .then((doc) => {
                        console.log('created notification', doc)
                    })
                    .catch((err) => {
                        console.log('error creating notification', err);
                    })
                    return emailService.inviteUserToTranslate({
                        from: req.user,
                        to: user,
                        articleId: article._id.toString(),
                        fromLang,
                        toLang,
                        whatsappUrl: generateWhatsappTranslateLink(article.video._id, article.langCode.split('-')[0]),
                        organizationName: article.organization.name,
                        organizationId: article.organization._id,
                        videoTitle: article.video.title,
                        toLangCode: article.langCode || toLang,
                        inviteToken: translator.inviteToken,
                        extraContent,
                    })
                })
                .catch(err => {
                    console.log(err);
                })
            })

        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },
    
    updateTextTranslators: function(req, res) {
        let { textTranslators } = req.body;
        const { articleId } = req.params;
        const newTranslators = [];
        if (!textTranslators) {
            textTranslators = [];
        }
        let finalTranslators = [];
        let removedTranslators = [];
        let article;
        Article.findById(articleId)
        .then((articleDoc) => {
            article = articleDoc.toObject();
            
            if (textTranslators.length > 0) {
                // Collect removed translators
                let newTranslatorsIds = textTranslators;
                article.textTranslators.forEach((translator) => {
                    if (newTranslatorsIds.indexOf(translator.user.toString()) === -1 ){
                        removedTranslators.push(translator);
                    }
                })
                textTranslators.forEach((translator) => {
                    if (!articleDoc.textTranslators.some((t) => t.user.toString() === translator)) {
                        const inviteToken = `${uuid()}-${uuid()}`;
                        const tranlatorObj = {
                            user: translator,
                            inviteToken,
                            invitedBy: req.user._id,
                        };
                        finalTranslators.push(tranlatorObj)
                        newTranslators.push(tranlatorObj)
                    } else {
                        finalTranslators.push(articleDoc.textTranslators.find((t) => t.user.toString() === translator))
                    }
                })
            } else {
                article.textTranslators.forEach((t) => {
                    removedTranslators.push(t);
                })
            }
            return Article.update({ _id: articleId }, { $set: { textTranslators: finalTranslators } })
        })
        .then(() => {
            return getArticleWithRelatedUsers(articleId);
        })
        .then((articleDoc) => {
            const textTranslators = articleDoc.textTranslators.map(t => ({ ...t, inviteToken: '' }));
            return res.json({ textTranslators })
        })
        // Fetch video and organization
        .then(() => {
            return new Promise((resolve, reject) => {
                videoService.findById(article.video)
                .then((videoDoc) => {
                    article.video = videoDoc;
                    return organizationService.findById(article.organization)
                })
                .then(organizationDoc => {
                    article.organization = organizationDoc;
                    resolve();
                })
                .catch(reject);
            })
        })
        .then(() => {
            return new Promise((resolve) => {
                // Remove pending invitation notifications from removed translators
                if (removedTranslators.length === 0) return resolve();
                const removeNotiFuncArray = [];
                removedTranslators.forEach((translator) => {
                    removeNotiFuncArray.push((cb) => {

                        const notiQuery = {
                            owner: translator.user,
                            organization: article.organization._id,
                            status: 'pending',
                            resource: articleId,
                            type: 'invited_to_translate_text',
                        }
                        notificationService.remove(notiQuery)
                        .then(() => {
                            cb();
                        })
                        .catch(err => {
                            console.log('err removing pending notifications', err);
                            cb()
                        })
                    })
                })
                async.parallelLimit(removeNotiFuncArray, 10, () => {
                    resolve();
                })
            })
        })
        .then(() => {
            if (newTranslators.length === 0) return;
            // Send email invitation and notification to new translators
            newTranslators.filter(t => t.user !== req.user._id.toString()).forEach((translator) => {
                const fromLang = isoLangs[article.video.langCode.split('-')[0]].name;
                const toLang = article.langName || isoLangs[article.langCode.split('-')[0]].name;

                let user;
                userService.findById(translator.user)
                .then((userData) => {
                    user = userData;
                    return authService.generateLoginToken(user._id);

                })
                .then(() => {
                    const notificationData = {
                        owner: user._id,
                        organization: article.organization._id,
                        from: req.user._id,
                        type: 'invited_to_translate_text',
                        content: `${req.user.email} has invited you to translate the text of the video "${article.title}" (${article.langCode}) `,
                        resource: articleId,
                        resourceType: 'article',
                        hasStatus: true,
                        status: 'pending',
                        inviteToken: translator.inviteToken,
                    }
                    notificationService.notifyUser({ email: user.email, organization: article.organization._id }, notificationData)
                    .then((doc) => {
                    })
                    .catch((err) => {
                        console.log('error creating notification', err);
                    })
                    return emailService.inviteUserToTranslateText({
                        from: req.user,
                        to: user,
                        articleId: article._id.toString(),
                        fromLang,
                        toLang,
                        whatsappUrl: generateWhatsappTranslateLink(article.video._id, article.langCode.split('-')[0]),
                        organizationName: article.organization.name,
                        organizationId: article.organization._id,
                        videoTitle: article.video.title,
                        toLangCode: article.langCode || toLang,
                        inviteToken: translator.inviteToken,
                    })
                })
                .catch(err => {
                    console.log(err);
                })
            })

        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    updateProjectLeaders: function(req, res) {
        let { projectLeaders } = req.body;
        const { articleId } = req.params;
        const newProjectLeaders = [];
        if (!projectLeaders) {
            projectLeaders = [];
        }
        let finalProjectLeaders = [];
        let removedProjectLeaders = [];
        let article;
        Article.findById(articleId)
        .then((articleDoc) => {
            article = articleDoc.toObject();
            
            if (projectLeaders.length > 0) {
                // Collect removed projectLeaders
                let newProjectLeadersIds = projectLeaders;
                article.projectLeaders.forEach((projectLeader) => {
                    if (newProjectLeadersIds.indexOf(projectLeader.user.toString()) === -1 ){
                        removedProjectLeaders.push(projectLeader);
                    }
                })
                projectLeaders.forEach((projectLeader) => {
                    if (!articleDoc.projectLeaders.some((t) => t.user.toString() === projectLeader.user)) {
                        const inviteToken = `${uuid()}-${uuid()}`;
                        const projectLeaderObj = {
                            user: projectLeader,
                            inviteToken,
                            invitedBy: req.user._id,
                        };
                        finalProjectLeaders.push(projectLeaderObj)
                        newProjectLeaders.push(projectLeaderObj)
                    } else {
                        finalProjectLeaders.push(articleDoc.projectLeaders.find((t) => t.user.toString() === projectLeader.user))
                    }
                })
            } else {
                article.projectLeaders.forEach((t) => {
                    removedProjectLeaders.push(t);
                })
            }
            return Article.update({ _id: articleId }, { $set: { projectLeaders: finalProjectLeaders } })
        })
        .then(() => {
            return getArticleWithRelatedUsers(articleId);
        })
        .then((articleDoc) => {
            const projectLeaders = articleDoc.projectLeaders.map(t => ({ ...t, inviteToken: '' }));
            return res.json({ projectLeaders })
        })
        // Fetch video and organization
        .then(() => {
            return new Promise((resolve, reject) => {
                videoService.findById(article.video)
                .then((videoDoc) => {
                    article.video = videoDoc;
                    return organizationService.findById(article.organization)
                })
                .then(organizationDoc => {
                    article.organization = organizationDoc;
                    resolve();
                })
                .catch(reject);
            })
        })
        .then(() => {
            return new Promise((resolve) => {
                // Remove pending invitation notifications from removed projectLeaders
                if (removedProjectLeaders.length === 0) return resolve();
                const removeNotiFuncArray = [];
                removedProjectLeaders.forEach((projectLeader) => {
                    removeNotiFuncArray.push((cb) => {

                        const notiQuery = {
                            owner: projectLeader.user,
                            organization: article.organization._id,
                            status: 'pending',
                            resource: articleId,
                            type: 'invited_to_lead_translation',
                        }
                        notificationService.remove(notiQuery)
                        .then(() => {
                            cb();
                        })
                        .catch(err => {
                            console.log('err removing pending notifications', err);
                            cb()
                        })
                    })
                })
                async.parallelLimit(removeNotiFuncArray, 10, () => {
                    resolve();
                })
            })
        })
        .then(() => {
            if (newProjectLeaders.length === 0) return;
            // Send email invitation and notification to new projectLeaders
            newProjectLeaders.filter(t => t.user !== req.user._id.toString()).forEach((projectLeader) => {
                const fromLang = isoLangs[article.video.langCode.split('-')[0]].name;
                const toLang = article.langName || isoLangs[article.langCode.split('-')[0]].name;

                let user;
                userService.findById(projectLeader.user)
                .then((userData) => {
                    user = userData;
                    return authService.generateLoginToken(user._id);

                })
                .then((token) => {
                    const notificationData = {
                        owner: user._id,
                        organization: article.organization._id,
                        from: req.user._id,
                        type: 'invited_to_lead_translation',
                        content: `${req.user.email} has invited you to lead the translation of the video "${article.title}" (${article.langCode}) `,
                        resource: articleId,
                        resourceType: 'article',
                        // hasStatus: true,
                        // status: 'pending',
                        inviteToken: projectLeader.inviteToken,
                    }
                    notificationService.notifyUser({ email: user.email, organization: article.organization._id }, notificationData)
                    .then((doc) => {
                    })
                    .catch((err) => {
                        console.log('error creating notification', err);
                    })
                    return emailService.inviteUserToLeadTranslation({
                        from: req.user,
                        to: user,
                        articleId: article._id.toString(),
                        fromLang,
                        toLang,
                        organizationName: article.organization.name,
                        organizationId: article.organization._id,
                        videoTitle: article.video.title,
                        inviteToken: token,
                    })
                })
                .catch(err => {
                    console.log(err);
                })
            })

        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },
    
    updateVerifiers: function(req, res) {
        const { articleId } = req.params;
        const { verifiers } = req.body;
        const newVerifiers = [];
        let article;
        Article.findById(articleId)
        .then(articleDoc => {
            article = articleDoc.toObject();
            if (verifiers && verifiers.length > 0) {
                const oldVerifiers = article.verifiers.map(r => r && r.toString());
                verifiers.forEach((verifier) => {
                    if (oldVerifiers.indexOf(verifier) === -1) {
                        newVerifiers.push(verifier);
                    }
                })
            }
            return Article.update({ _id: articleId }, { $set: { verifiers } })
        })
        .then(() => getArticleWithRelatedUsers(articleId))
        .then((article) => {
            return res.json({ verifiers: article.verifiers });
        })
        // Fetch video and organization
        .then(() => {
            return new Promise((resolve, reject) => {
                videoService.findById(article.video)
                .then((videoDoc) => {
                    article.video = videoDoc;
                    return organizationService.findById(article.organization)
                })
                .then(organizationDoc => {
                    article.organization = organizationDoc;
                    resolve();
                })
                .catch(reject);
            })
        })
        .then(() => {
            if (newVerifiers.length > 0) {
                const fromLang = isoLangs[article.video.langCode.split('-')[0]].name;
                const toLang = article.langName || isoLangs[article.langCode.split('-')[0]].name;
                newVerifiers.forEach(verifier => {
                    let user;
                    userService.findById(verifier)
                    .then((userDoc) => {
                        user = userDoc;

                        const notificationData = {
                            owner: user._id,
                            organization: article.organization._id,
                            from: req.user._id,
                            type: 'invited_to_verify',
                            content: `${req.user.email} has assigned you to verify the translation of the video "${article.title}" from ${fromLang} to ${toLang}`,
                            resource: articleId,
                            resourceType: 'article',
                            hasStatus: false,
                        }
                        notificationService.notifyUser({ email: user.email, organization: article.organization._id }, notificationData)
                        .then((doc) => {
                        })
                        .catch((err) => {
                            console.log('error creating notification', err);
                        })
                       return authService.generateLoginToken(user._id);
                    })
                    .then((token) => {
                        return emailService.inviteUserToVerifyTranslation({
                            from: req.user,
                            to: user,
                            articleId: article._id.toString(),
                            fromLang,
                            toLang,
                            organizationName: article.organization.name,
                            organizationId: article.organization._id,
                            videoTitle: article.video.title,
                            toLangCode: article.langCode || toLang,
                            inviteToken: token,
                        })
                    })
                    .catch((err) => {
                        console.log('Error sending email to user', err);
                    })
                });
            }
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    resendEmailToVerifier: function(req, res) {
        const { articleId } = req.params;
        const { userId } = req.body;
        let article;
        let fromLang;
        let toLang;
        let user;
        let video;
        let organization;
        Article.findById(articleId)
        .then(a => {
            article = a;
            return videoService.findById(article.video);
        })
        .then((v) => {
            video = v;
            fromLang = isoLangs[video.langCode.split('-')[0]].name;
            toLang = article.langName || isoLangs[article.langCode.split('-')[0]].name;

            return userService.findById(userId);
        })
        .then(u => {
            user = u;
            return organizationService.findById(article.organization);
        })
        .then(org => {
            organization = org;
            return authService.generateLoginToken(user._id);
        })
        .then(token => {
            res.json({ success: true })
            return emailService.inviteUserToVerifyTranslation({
                from: req.user,
                to: user,
                articleId: article._id.toString(),
                fromLang,
                toLang,
                organizationName: organization.name,
                organizationId: organization._id,
                videoTitle: article.title,
                toLangCode: article.langCode || toLang,
                inviteToken: token,
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    
    updateTranslatorFinishDate: function(req, res) {
        const { articleId } = req.params;
        const { speakerNumber, timestamp } = req.body;
        let article;
        let translators;
        Article.findById(articleId)
        .then((articleDoc) => {
            if (!articleDoc) throw new Error('Invalid article id');
            article = articleDoc.toObject();
            translators = article.translators;
            translators.find(t => t.speakerNumber === speakerNumber).finishDate = timestamp;
            return Article.update({ _id: articleId }, { $set: { translators } });
        })
        .then(() => {
            return res.json({ translators: article.translators });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    getUserTranslations: function(req, res) {
        const perPage = 10;
        let { organization, page, search, user } = req.query;
        const query = {
            // articleType: 'translation',
            // organization,
            $and: [
                { organization },
                { articleType: 'translation'},

                {
                    $or: [{ archived: false }, { archived: { $exists: false }}],
                },
                {
                    $or: [{ 'translators.user': user }, { 'textTranslators.user': user }],
                },
                
            ]
        }
        // query['translators.user'] = user
        const queryKeys = Object.keys(req.query)
        // Remove page if it's in the query
        if (queryKeys.indexOf('page') !== -1) {
            delete req.query.page
        }
        
        if (queryKeys.indexOf('search') !== -1) {
            query.title = new RegExp(search, 'ig');
            delete req.query.search;
        }

        if (queryKeys.indexOf('archived') !== -1) {
            delete req.query.archived;
        }

        if (page) {
            page = parseInt(page);
        } else {
            page = 1;
        }

        const skip = page === 1 || page === 0 ? 0 : (page * perPage - perPage);

        const metrics = [];
        const articlesWithMetrics = []

        Article.find({ ...query })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(perPage)
        .then((articles) => {
            return new Promise((resolve, reject) => {
                const processArticleFuncArray = articles.map(article => cb => {
                    article = article.toObject();
                    videoService.findById(article.video)
                    .then((videoDoc) => {
                        article.video = videoDoc;
                        article = utils.cleanArticleSilentAndBackgroundMusicSlides(article);
                        const { speakersProfile } = article;
                        const speakersMetrics = [];
                        const subslides = article.slides.slice().reduce((acc, s) => acc.concat(s.content), []);
                        speakersProfile.forEach((speaker) => {
                            const totalSpeakerCount = subslides.filter(s => s.speakerProfile.speakerNumber === speaker.speakerNumber).length;
                            const completedAudioCount = subslides.filter((s) => s.text && s.audio && s.speakerProfile.speakerNumber === speaker.speakerNumber).length;
                            speakersMetrics.push({
                                speaker,
                                progress: Math.ceil(completedAudioCount / totalSpeakerCount * 100),
                            })
                        });
        
                        const totalSubslidesCount = subslides.length;
                        const totalCompletedCount = subslides.filter(s => s.text && s.audio).length;
                        const completedAudioCount = subslides.filter(s => s.audio).length
                        const completedTextCount = subslides.filter(s => s.text).length;
                        
                        const audioCompleted = Math.round(completedAudioCount/totalSubslidesCount * 100);
                        const textCompleted = Math.round(completedTextCount / totalSubslidesCount * 100);
                        const totalCompleted = Math.round(totalCompletedCount / totalSubslidesCount * 100);
        
                        articlesWithMetrics.push({ ...article, metrics: { completed: { audio: audioCompleted, text: textCompleted, total: totalCompleted  }, speakersMetrics }})
                        metrics.push(speakersMetrics)
                        return cb();
                    })
                    .catch(err => {
                        console.log(err);
                        return cb()
                    })
                })
                async.parallelLimit(processArticleFuncArray, 10, () => {
                    // Remove slides from the returned object
                    articlesWithMetrics.forEach((am) => {
                        delete am.slides;
                    })
                    
                    Article.count(query)
                    .then(resolve)
                    .catch(reject)
                })
            })
        })
        .then((count) => {
            return res.json({ articles: articlesWithMetrics, pagesCount: Math.ceil(count/perPage) });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    
    getTranscriptionVersions: function(req, res) {
        const { videoId } = req.query;
        videoService.findById(videoId)
        .then(video => {
            return Article.find({ transcriptionArticle: video.article, articleType: 'transcription_version' })
        })
        .then(articles => {
            return res.json({ articles });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },
    
    setTranscriptionVersionForSubslide: function (req, res) {
        const { articleId } = req.params;
        let { slidePosition, subslidePosition, transcriptionVersionArticleId } = req.body;
        let transcriptionArticle;
        let transcriptionVersion;
        let subslide;

        slidePosition = parseInt(slidePosition);
        subslidePosition = parseInt(subslidePosition)
        Article.findById(articleId)
            .then(t => {
                transcriptionArticle = t;
                subslide = transcriptionArticle.slides.find(s => s.position === slidePosition).content.find(s => s.position === subslidePosition);
                return Article.findById(transcriptionVersionArticleId)
            })
            .then(tt => {
                transcriptionVersion = tt;
                const versionSubslide = transcriptionVersion.slides.find(s => s.position === slidePosition).content.find(s => s.position === subslidePosition)
                subslide.text = versionSubslide.text;
                subslide.transcriptionVersionArticleId = transcriptionVersionArticleId;
                return utils.updateSubslideUsingPosition(articleId, slidePosition, subslidePosition, {
                    text: subslide.text,
                    transcriptionVersionArticleId: subslide.transcriptionVersionArticleId
                })
            })
            .then(() => {
                return res.json({ subslide, slidePosition, subslidePosition });
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send('Something went wrong');
            })
    },

    setTranscriptionVersionForAllSubslides: function (req, res) {
        const { articleId } = req.params;
        let { transcriptionVersionArticleId } = req.body;
        let transcriptionArticle;
        let translationVersion;

        Article.findById(articleId)
        .then(t => {
            transcriptionArticle = utils.cleanArticleSilentAndBackgroundMusicSlides(t);
            return Article.findById(transcriptionVersionArticleId)
        })
        .then(tt => {
            return new Promise((resolve) => {
                translationVersion = utils.cleanArticleSilentAndBackgroundMusicSlides(tt);
                const updateFuncArray = [];
                const subslides = transcriptionArticle.slides.reduce((acc, s) => s.content && s.content.length > 0 ? acc.concat(s.content.map(ss => ({ ...ss, slidePosition: s.position, subslidePosition: ss.position }))) : [], []);

                subslides.forEach(subslide => {
                    const versionSubslide = translationVersion.slides.find(s => s.position === subslide.slidePosition).content.find(s => s.position === subslide.subslidePosition);
                    if (versionSubslide) {
                        updateFuncArray.push(cb => {
                            utils.updateSubslideUsingPosition(articleId, subslide.slidePosition, subslide.subslidePosition, {
                                text: versionSubslide.text,
                                transcriptionVersionArticleId: translationVersion._id
                            })
                            .then(() => {
                                cb()
                            })
                            .catch(err => {
                                console.log(err);
                                cb();
                            })
                        })
                    }

                })

                async.parallelLimit(updateFuncArray, 10, () => {
                    return resolve()
                })
            })
        })
        .then(() => Article.findById(articleId))
        .then((article) => {
            return res.json({ article: utils.cleanArticleSilentAndBackgroundMusicSlides(article) });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    getArticlesTranslations: function(req, res) {
        const perPage = 10;
        let { organization, page, archived, search, stage, folder } = req.query;

        if (!archived) {
            archived = false;
        }
        const query = {
            organization,
            status: ['converting', 'done']
        }
        const queryKeys = Object.keys(req.query)
        // Remove page if it's in the query
        if (queryKeys.indexOf('page') !== -1) {
            delete req.query.page
        }

        if (queryKeys.indexOf('stage') !== -1) {
            delete req.query.stage;
        }

        if (queryKeys.indexOf('search') !== -1) {
            if (search) {
                query.title = new RegExp(search, 'ig');
            }
            delete req.query.search;
        }

        if (queryKeys.indexOf('archived') !== -1) {
            delete req.query.archived;
        }

        if (folder) {
            query.folder = folder;
            delete req.query.folder;
        } else {
            query.folder = {
                $exists: false,
            };
        }

        if (page) {
            page = parseInt(page);
        } else {
            page = 1;
        }

        const skip = page === 1 || page === 0 ? 0 : (page * perPage - perPage);

        Object.keys(req.query).forEach(key => {
            query[key] = req.query[key];
        });
        let videos;
        Video.find({ ...query })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(perPage)
        .then(v => {
            videos = v;
            const fetchArticlesFuncArray = [];
            videos.forEach(video => {
                fetchArticlesFuncArray.push((cb) => {
                    const articleQuery = {
                        video: video._id,
                        articleType: 'translation',
                        archived,
                    }
                    if (stage) {
                        if (Array.isArray(stage)) {
                            articleQuery.stage = {
                                $in: stage
                            }
                        } else {
                            articleQuery.stage = stage;
                        }
                    }
                    Article.find(articleQuery)
                    .then((articles) => {
                        const metrics = [];
                        const articlesWithMetrics = []
                        articles.forEach((article) => {
                            article = utils.cleanArticleSilentAndBackgroundMusicSlides(article.toObject());
                            const { speakersProfile } = article;
                            const speakersMetrics = [];
                            const subslides = article.slides.slice().reduce((acc, s) => acc.concat(s.content), []);
                            speakersProfile.forEach((speaker) => {
                                const totalSpeakerCount = subslides.filter(s => s.speakerProfile.speakerNumber === speaker.speakerNumber).length;
                                const completedAudioCount = subslides.filter((s) => s.text && s.audio && s.speakerProfile.speakerNumber === speaker.speakerNumber).length;
                                speakersMetrics.push({
                                    speaker,
                                    progress: Math.ceil(completedAudioCount / totalSpeakerCount * 100),
                                })
                            });

                            const totalSubslidesCount = subslides.length;
                            const totalCompletedCount = subslides.filter(s => s.text && s.audio).length;
                            const completedAudioCount = subslides.filter(s => s.audio).length
                            const completedTextCount = subslides.filter(s => s.text).length;
                            
                            const audioCompleted = Math.round(completedAudioCount/totalSubslidesCount * 100);
                            const textCompleted = Math.round(completedTextCount / totalSubslidesCount * 100);
                            const totalCompleted = Math.round(totalCompletedCount / totalSubslidesCount * 100);
                            articlesWithMetrics.push({ ...article, metrics: { completed: { audio: audioCompleted, text: textCompleted, total: totalCompleted  }, speakersMetrics }})
                            metrics.push(speakersMetrics)
                        })
                        // Remove slides from the returned object
                        articlesWithMetrics.forEach((am) => {
                            delete am.slides;
                        })
                        Article.findById(video.article)
                        .then((originalArticleDoc) => {
                            const originalArticle = originalArticleDoc.toObject();
                            delete originalArticle.slides;
                            return cb(null, { video, articles: articlesWithMetrics, originalArticle });
                        })
                        .catch(cb);
                    })
                    .catch(err => {
                        console.log(err);
                        return cb();
                    })
                })
            })
            async.parallelLimit(fetchArticlesFuncArray, 10, (err, result) => {
                if (err) throw err;
                videoService.count(query)
                .then((count) => {
                    return res.json({ videos: result, pagesCount: Math.ceil(count/perPage) });
                })
                .catch(err => {
                    console.log(err);
                    return res.json({ videos: result, pagesCount: null});                    
                })
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message || 'Something went wrong');
        })
    },
    getSingleArticleTranslations: function(req, res) {
        const perPage = 10;
        let { organization, page, archived, search, stage } = req.query;

        if (!archived) {
            archived = false;
        }
        const query = {
            organization,
            status: 'done'
        }
        const queryKeys = Object.keys(req.query)
        // Remove page if it's in the query
        if (queryKeys.indexOf('page') !== -1) {
            delete req.query.page
        }

        if (queryKeys.indexOf('stage') !== -1) {
            delete req.query.stage;
        }

        if (queryKeys.indexOf('search') !== -1) {
            query.title = new RegExp(search, 'ig');
            delete req.query.search;
        }

        if (queryKeys.indexOf('archived') !== -1) {
            delete req.query.archived;
        }

        if (page) {
            page = parseInt(page);
        } else {
            page = 1;
        }

        const skip = page === 1 || page === 0 ? 0 : (page * perPage - perPage);

        Object.keys(req.query).forEach(key => {
            query[key] = req.query[key];
        });
        let videos;
        Video.find({ ...query })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(perPage)
        .then(v => {
            videos = v;
            const fetchArticlesFuncArray = [];
            videos.forEach(video => {
                fetchArticlesFuncArray.push((cb) => {
                    const articleQuery = {
                        video: video._id,
                        articleType: 'translation',
                        archived,
                    }
                    if (stage) {
                        if (Array.isArray(stage)) {
                            articleQuery.stage = {
                                $in: stage
                            }
                        } else {
                            articleQuery.stage = stage;
                        }
                    }
                    getArticlesWithRelatedUsers(articleQuery)
                    .then((articles) => {
                        const metrics = [];
                        const articlesWithMetrics = []
                        articles.forEach((article) => {
                            if (article.toObject) {
                                article = utils.cleanArticleSilentAndBackgroundMusicSlides(article.toObject());
                            }
                            const { speakersProfile } = article;
                            const speakersMetrics = [];
                            const subslides = article.slides.slice().reduce((acc, s) => acc.concat(s.content), []);
                            speakersProfile.forEach((speaker) => {
                                const totalSpeakerCount = subslides.filter(s => s.speakerProfile.speakerNumber === speaker.speakerNumber).length;
                                const completedAudioCount = subslides.filter((s) => s.text && s.audio && s.speakerProfile.speakerNumber === speaker.speakerNumber).length;
                                speakersMetrics.push({
                                    speaker,
                                    progress: Math.ceil(completedAudioCount / totalSpeakerCount * 100),
                                })
                            });

                            const totalSubslidesCount = subslides.length;
                            const totalCompletedCount = subslides.filter(s => s.text && s.audio).length;
                            const completedAudioCount = subslides.filter(s => s.audio).length
                            const completedTextCount = subslides.filter(s => s.text).length;
                            
                            const audioCompleted = Math.round(completedAudioCount/totalSubslidesCount * 100);
                            const textCompleted = Math.round(completedTextCount / totalSubslidesCount * 100);
                            const totalCompleted = Math.round(totalCompletedCount / totalSubslidesCount * 100);
                            articlesWithMetrics.push({ ...article, metrics: { completed: { audio: audioCompleted, text: textCompleted, total: totalCompleted  }, speakersMetrics }})
                            metrics.push(speakersMetrics)
                        })
                        // Remove slides from the returned object
                        articlesWithMetrics.forEach((am) => {
                            delete am.slides;
                        })
                        Article.findById(video.article)
                        .then((originalArticleDoc) => {
                            const originalArticle = originalArticleDoc.toObject();
                            delete originalArticle.slides;
                            return cb(null, { video, articles: articlesWithMetrics, originalArticle });
                        })
                        .catch(cb);
                    })
                    .catch(err => {
                        console.log(err);
                        return cb();
                    })
                })
            })
            async.parallelLimit(fetchArticlesFuncArray, 10, (err, result) => {
                if (err) throw err;
                videoService.count(query)
                .then((count) => {
                    return res.json({ videos: result, pagesCount: Math.ceil(count/perPage) });
                })
                .catch(err => {
                    console.log(err);
                    return res.json({ videos: result, pagesCount: null});                    
                })
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message || 'Something went wrong');
        })
    },

    getTranslationsCount: function(req, res) {
        const { videoId } = req.query;
        Article.find({ video: videoId, articleType: 'translation', archived: { $ne: true } })
        .then((articles) => {
            const counts = {
                text_translation: 0,
                text_translation_done: 0,
                voice_over_translation: 0,
                voice_over_translation_done: 0,
                done: 0,
                signlansignlanguage_translation: 0,
                signlansignlanguage_translation_done: 0,
            }
            articles.filter(a => a.stage).forEach(article => {
                counts[article.stage] += 1;
            })

            return res.json(counts);
        }) 
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    getArticleForWhatsApp: (req, res) => {
        let langFromRegex = new RegExp(`^${req.query.langFrom}`);
        const articleQuery = { organization: "5dd23585b4703d001108bbb1", articleType: 'original', converted: true, langCode: { $regex: langFromRegex }, $or: [{ archived: false }, { archived: {$exists: false} }] };
    
        Article.count(articleQuery)
            .then(count => {
                const randomNumber = Math.floor(Math.random() * count)
                Article.find({ ...articleQuery })
                .skip(randomNumber)
                .limit(1)
                .then(articles => {
                    if (!articles || articles.length === 0) {
                        return res.json({ article: null });
                    }

                    return res.json({ article: articles[0] })
                })
                .catch(console.error)
            })
            .catch(console.error)
    },
    getArticlesCount: function(req, res) {
        const query = req.query;
        Object.keys(query).forEach((key) => {
            if (key && key.indexOf && key.indexOf('$') === 0) {
                const val = query[key];
                query[key] = [];
                Object.keys(val).forEach((subKey) => {
                    val[subKey].forEach(subVal => {
                        query[key].push({ [subKey]: subVal })
                    })
                })
            }
        })
        Article.count(query)
        .then(count => res.json(count))
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message)
        })
    }
}

module.exports = controller;