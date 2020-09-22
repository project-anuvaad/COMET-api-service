const fs = require('fs');
const uuid = require('uuid').v4;
const async = require('async');
const queues = require('../shared/workers/vendors/rabbitmq/queues');
const Video = require('../shared/models').Video
const {
    articleService,
    storageService,
    websocketsService,
} = require('../shared/services');
const websocketsEvents = require('../shared/services/websockets/websockets/events');
const websocketsRooms = require('../shared/services/websockets/websockets/rooms');

const GENERATE_VIDEO_THUMBNAIL_FINISH = 'GENERATE_VIDEO_THUMBNAIL_FINISH';
const COMPRESS_VIDEO_FINISH = 'COMPRESS_VIDEO_FINISH';

const WHATSAPP_CUT_VIDEO_STARTED_QUEUE = 'WHATSAPP_CUT_VIDEO_STARTED_QUEUE';
const WHATSAPP_CUT_VIDEO_DONE_QUEUE = 'WHATSAPP_CUT_VIDEO_DONE_QUEUE';
const WHATSAPP_TRANSCRIBE_VIDEO_DONE_QUEUE = 'WHATSAPP_TRANSCRIBE_VIDEO_DONE_QUEUE';

const WHATSAPP_VIDEO_AVAILABLE_TO_CUT_QUEUE = 'WHATSAPP_VIDEO_AVAILABLE_TO_CUT_QUEUE';

// const translatioService = require('../shared/services/translation')

let rabbitmqChannel;

function init({ channel, workers }) {
    rabbitmqChannel = channel;
    
    const { applyTranscriptionOnArticle, notifyUserAITranscriptionFinished } = require('./utils')({ workers });

    rabbitmqChannel.assertQueue(queues.CONVERT_VIDEO_TO_ARTICLE_FINISH_QUEUE, { durable: true });
    rabbitmqChannel.consume(queues.CONVERT_VIDEO_TO_ARTICLE_FINISH_QUEUE, onConvertArticleFinish, { noAck: false });

    rabbitmqChannel.assertQueue(GENERATE_VIDEO_THUMBNAIL_FINISH, { durable: true });
    rabbitmqChannel.consume(GENERATE_VIDEO_THUMBNAIL_FINISH, onGenerateVideoThumbnailFinish, { noAck: false });

    rabbitmqChannel.assertQueue(COMPRESS_VIDEO_FINISH, { durable: true });
    rabbitmqChannel.consume(COMPRESS_VIDEO_FINISH, onCompressVideoFinish, { noAck: false });

    rabbitmqChannel.assertQueue(queues.TRANSCRIBE_VIDEO_FINISHED_QUEUE, { durable: true });
    rabbitmqChannel.consume(queues.TRANSCRIBE_VIDEO_FINISHED_QUEUE, onTranscribeVideoFinish, { noAck: false });

    rabbitmqChannel.assertQueue(queues.EXTRACT_VIDEO_BACKGROUND_MUSIC_FINISH_QUEUE, { durable: true });
    rabbitmqChannel.consume(queues.EXTRACT_VIDEO_BACKGROUND_MUSIC_FINISH_QUEUE, onExtractBackgroundMusicFinish, { noAck: false });
    
    rabbitmqChannel.assertQueue(queues.TRANSCRIBE_VIDEO_STARTED_QUEUE, { durable: true })
    rabbitmqChannel.consume(queues.TRANSCRIBE_VIDEO_STARTED_QUEUE, onTranscribeVideoStarted, { noAck: false });
    
    rabbitmqChannel.assertQueue(queues.TRANSCRIBE_VIDEO_FAILED_QUEUE, { durable: true })
    rabbitmqChannel.consume(queues.TRANSCRIBE_VIDEO_FAILED_QUEUE, onTranscribeVideoFailed, { noAck: false });

    rabbitmqChannel.assertQueue(queues.EXTRACT_VIDEO_VOICE_FINISH_QUEUE, { durable: true });
    rabbitmqChannel.consume(queues.EXTRACT_VIDEO_VOICE_FINISH_QUEUE, onExtractVoiceFinish, { noAck: false });
    
    rabbitmqChannel.assertQueue(queues.AUTOMATIC_BREAK_VIDEO_REQUEST_FINISH_QUEUE, { durable: true });
    rabbitmqChannel.consume(queues.AUTOMATIC_BREAK_VIDEO_REQUEST_FINISH_QUEUE, onBreakVideoFinish, { noAck: false });

    rabbitmqChannel.assertQueue(WHATSAPP_CUT_VIDEO_STARTED_QUEUE, { durable: true });
    rabbitmqChannel.consume(WHATSAPP_CUT_VIDEO_STARTED_QUEUE, onWhatsappCutVideoStarted, { noAck: false });
    
    rabbitmqChannel.assertQueue(WHATSAPP_CUT_VIDEO_DONE_QUEUE, { durable: true });
    rabbitmqChannel.consume(WHATSAPP_CUT_VIDEO_DONE_QUEUE, onWhatsappCutVideoDone, { noAck: false });

    rabbitmqChannel.assertQueue(WHATSAPP_TRANSCRIBE_VIDEO_DONE_QUEUE, { durable: true });
    rabbitmqChannel.consume(WHATSAPP_TRANSCRIBE_VIDEO_DONE_QUEUE, onWhatsappTranscribeVideoDone, { noAck: false });

    rabbitmqChannel.assertQueue(WHATSAPP_VIDEO_AVAILABLE_TO_CUT_QUEUE, { durable: true });

    function parseMessageContent(msg) {
        return JSON.parse(msg.content.toString());
    }

    function onGenerateVideoThumbnailFinish(msg) {
        channel.ack(msg);
        const { id, url, duration } = parseMessageContent(msg);
        console.log('on generate video thumbnail finish', id, url)
        const update = {
            thumbnailLoading: false,
        }
        if (url) {
            update.thumbnailUrl = url;
        }
        if (duration) {
            update.duration = duration;
        }

        Video.findByIdAndUpdate(id, { $set: update })
        .then(() => {
            return Video.findById(id)
        })
        .then(video => {
            video = video.toObject();
            websocketsService.emitEvent({ room: websocketsRooms.getOrganizationRoom(video.organization), event: websocketsEvents.VIDEO_THUMBNAIL_GENERATED, data: video });
        })
        .catch(err => {
            console.log(err);
        })
    }

    function onCompressVideoFinish(msg) {
        channel.ack(msg);
        const { id, url } = parseMessageContent(msg);
        console.log('on compress uploaded video finish', id, url);
        Video.findByIdAndUpdate(id, { $set: { compressedVideoUrl: url }})
        .then(() => {
        })
        .catch(err => {
            console.log(err);
        })
    }

    function onConvertArticleFinish(msg) {
        // Archive all old article Translations
        const { id, slides, status } = parseMessageContent(msg);

        let article;
        let video;
        let articleId;
        if (status === 'failed') {
            channel.ack(msg);
            return Video.findByIdAndUpdate(id, { $set: { status: 'proofreading' }})
            .then(() => {
                console.log('Conversion failed in exporter, resetting status to proofreading');  
            })
            .catch(err => {
                console.log(err);
            })
        }
        Video.findById(id).then(videoDoc => {
            if (!videoDoc) throw new Error(`Invalid video id ${videoId}`);
            video = videoDoc.toObject();
            // Send notification to users that the video is now done

            return articleService.findById(video.article)
        })
        .then((articleDoc) => {
            if (!articleDoc) throw new Error('Invalid article id');
            article = articleDoc.toObject();
            articleId = article._id;
            // If the article is just refreshing the media content, don't archive old articles
            if (article.refreshing) {
                console.log('just refreshing');
                return articleService.update({ _id: articleId }, { refreshing: false });
            } else {
                console.log('archiving all old articles');
                return articleService.update({ video: id, _id: { $nin: [articleId] } }, { archived: true })
            }
        })
        .then(() => Video.findByIdAndUpdate(id, { $set: { status: 'done' } }))
        .then(() => articleService.findByIdAndUpdate(video.article, { slides, converted: true }))
        .then(() => Video.findById(id))
        .then((videoDoc) => {
            video = videoDoc.toObject()
            // websocketsService.emitEvent({ _id: video.convertedBy, event: websocketsEvents.VIDEO_DONE, data: video });
            websocketsService.emitEvent({ room: websocketsRooms.getOrganizationRoom(video.organization.toString()), event: websocketsEvents.VIDEO_CONVERT_TO_ARTICLE_FINISH, data: video })
            return Promise.resolve()
        })
        .then(() => {
            rabbitmqChannel.ack(msg)
            console.log('done afterconvert rabbitmq');
            if (article.refreshing && article.articleType === 'original') {
                // if it was refreshing, update other articles with the new medias
                return syncTranslationArticlesMediaWithOriginal(articleId);
            } else {
                // Generate TTS version for directly to english articles
                if (!article.toEnglish) return;
                // return translatioService.generateTTSArticle(articleId, 'en')
            }
        })
        .catch((err) => {
            rabbitmqChannel.ack(msg)
            console.log(err);
        })
    }

    // function getSpeakersFromSlides(slides) {
    //     const speakers = [];
    //     slides.forEach((slide) => {
    //         slide.content.forEach((subslide) => {
    //             if (speakers.map(s => s.speakerNumber).indexOf(subslide.speakerProfile.speakerNumber) === -1) {
    //                 speakers.push(subslide.speakerProfile);
    //             }
    //         })
    //     })
    //     return speakers;
    // }

    function onTranscribeVideoFinish(msg) {
        const { videoId, duration, transcriptionUrl, transcriptionScriptUrl, transcriptionScriptContent } = parseMessageContent(msg);
        console.log('transcription url', videoId, transcriptionUrl, transcriptionScriptUrl)
        let video
        rabbitmqChannel.ack(msg);

        const videoUpdate = {
            transcribeEndTime: Date.now(),
            AITranscriptionLoading: false,
        };

        if (duration) {
            videoUpdate.duration = duration;
        }
        if (transcriptionUrl) {
            videoUpdate.transcriptionUrl = transcriptionUrl;
        }
        if (transcriptionScriptUrl) {
            videoUpdate.transcriptionScriptUrl = transcriptionScriptUrl;
        }
        if (transcriptionScriptContent) {
            videoUpdate.transcriptionScriptContent = transcriptionScriptContent;
        }
        
        return Video.findByIdAndUpdate(videoId, { $set: videoUpdate })
        .then(() => Video.findById(videoId))
        .then((v) => {
            video = v;
            notifyUserAITranscriptionFinished(video.article);
            if (video.status !== 'proofreading') {
                return;
            }
            let originalArticle;
            let transcriptionVersionArticle;
            articleService.find({ video: videoId, articleType: 'original' })
            .then(articles => {
                articles.forEach(a => {
                    if (!a.archived) {
                        originalArticle = a;
                    }
                })
                return articleService.find({ video: videoId, articleType: 'transcription_version', isAITranscription: true });
            })
            .then(articles => {
            articles.forEach(a => {
                if (!a.archived) {
                    transcriptionVersionArticle = a;
                }
            }) 
            const applyTranscriptionFuncs = [
                (cb) => {
                    if (originalArticle && transcriptionUrl) {
                            applyTranscriptionOnArticle(originalArticle._id, transcriptionUrl)
                            .then(() => {
                                console.log('applied transcription on original article', originalArticle._id);
                                cb();
                            })
                            .catch(err => {
                                console.log('error applying transcription on original article', originalArticle._id, err);
                                cb();
                            })
                    } else if (originalArticle) {
                        const updateAITranscribeFuncArray = [];
                        originalArticle.slides.forEach(s => {
                            s.content.forEach(ss => {
                                updateAITranscribeFuncArray.push(cb => {
                                    articleService.updateSubslideUsingPosition(originalArticle._id, s.position, ss.position, { AITranscriptionLoading: false })
                                    .then(() => cb())
                                    .catch(err => {
                                        console.log(err);
                                        cb();
                                    })
                                })
                            })
                        })
                        async.parallelLimit(updateAITranscribeFuncArray, 2, () => {
                            cb();
                        })
                    } else {
                        setTimeout(() => {
                            cb();
                        });
                    }
                }, (cb) => {
                        if (transcriptionVersionArticle && transcriptionUrl) {
                                applyTranscriptionOnArticle(transcriptionVersionArticle._id, transcriptionUrl)
                                .then(() => {
                                    console.log('applied transcription on article', originalArticle._id);
                                    cb();
                                })
                                .catch(err => {
                                    console.log('error applying transcription on transcription article', originalArticle._id, err);
                                    cb();
                                })
                        } else if (transcriptionUrl) {
                            let clonedArticle;
                            articleService.cloneArticle(originalArticle._id) 
                                .then(ca => {
                                    clonedArticle = ca;
                                    const clonedArticleUpdate = {
                                        articleType: 'transcription_version',
                                        isAITranscription: true,
                                        transcriptionArticle: originalArticle._id,
                                        archived: false,
                                    };
                                    return articleService.updateById(clonedArticle._id, clonedArticleUpdate);
                                })
                                .then(() => {
                                    return applyTranscriptionOnArticle(clonedArticle._id, transcriptionUrl)
                                })
                                .then(() => {
                                    cb();
                                })
                                .catch(err => {
                                    console.log(err);
                                    cb();
                                })
                        } else if (transcriptionVersionArticle) {
                            const updateAITranscribeFuncArray = [];
                            transcriptionVersionArticle.slides.forEach(s => {
                                s.content.forEach(ss => {
                                    updateAITranscribeFuncArray.push(cb => {
                                        articleService.updateSubslideUsingPosition(transcriptionVersionArticle._id, s.position, ss.position, { AITranscriptionLoading: false })
                                        .then(() => cb())
                                        .catch(err => {
                                            console.log(err);
                                            cb();
                                        })
                                    })
                                })
                            })
                            async.parallelLimit(updateAITranscribeFuncArray, 2, () => {
                                cb();
                            }) 
                        } else {
                            setTimeout(() => {
                                cb();
                            });
                        }
                }];
                async.series(applyTranscriptionFuncs, () => {
                        const event = { room: websocketsRooms.getOrganizationRoom(video.organization), event: `${websocketsEvents.AI_TRANSCRIBE_VIDEO_FINISH}/${video._id}`, data: video};
                        const event2 = { room: websocketsRooms.getOrganizationRoom(video.organization), event: `${websocketsEvents.AI_TRANSCRIBE_VIDEO_FINISH}`, data: video };
                        websocketsService.emitEvent(event)
                        websocketsService.emitEvent(event2)
                })
            })
        })
        .catch((err) => {
            console.log(err);
            // rabbitmqChannel.ack(msg);
        })
        // else if (videoId.split('-').length === 3) {
        //     const [ articleId, slidePosition, subslidePosition ] = videoId.split('-');
        //     console.log('GOT SUBVIDEO CUT', videoId, slides);
        //     const transcribedText = slides.reduce((acc, s) => acc.concat(s.content), []).map(s => s.text).join(',');
        //     console.log(transcribedText)
        //     articleService.updateSubslideUsingPosition(articleId, slidePosition, subslidePosition, { text: transcribedText, AITranscriptionLoading: false })
        //     .then(() => {
        //         console.log('TRANSCRIPTION UPDATED')
        //         rabbitmqChannel.ack(msg)
        //     })
        //     .catch(err => {
        //         console.log(err);
        //         rabbitmqChannel.ack(msg)
        //     })
        // } else { 
        //     console.log('unknown video id format', videoId)
        //     rabbitmqChannel.ack(msg);
        // }
    }

    function onExtractBackgroundMusicFinish(msg) {
        const { id, status, url, Key } = parseMessageContent(msg);
        console.log('extracting background music finished', id)
        let video;
        Video.findById(id)
            .then((videoDoc) => {
                if (!videoDoc) throw new Error(`Invalid video id ${id}`);
                video = videoDoc.toObject();
                if (status === 'success') {
                    return Video.update({ _id: id }, { $set: { backgroundMusicUrl: url, backgroundMusicKey: Key, extractBackgroundMusicLoading: false, backgroundMusicTransposed: true, hasBackgroundMusic: true }})
                } else {
                    return Video.update({ _id: id }, { $set: { extractBackgroundMusicLoading: false } })
                }
            })
            .then(() => {
                rabbitmqChannel.ack(msg);
                if (video.extractBackgroundMusicBy) {
                    websocketsService.emitEvent({ _id: video.extractBackgroundMusicBy, event: websocketsEvents.EXTRACT_VIDEO_BACKGROUND_MUSIC_FINISH, data: video });
                }
            })
            .catch((err) => {
                console.log(err);
                rabbitmqChannel.ack(msg);
            })
    }

    function onTranscribeVideoStarted(msg) {
        const { videoId, jobName, audioUrl } = parseMessageContent(msg);
        if (videoId.split('-').length === 1) {
            // Video.findByIdAndUpdate(videoId, { $set: { jobName, audioUrl, status: 'transcriping' } })
            // .then(() => {
            //     rabbitmqChannel.ack(msg);
            // })
            // .catch(err => {
            //     console.log('error updating video with jobName', err);
            //     rabbitmqChannel.ack(msg);
            // })
            rabbitmqChannel.ack(msg)
        } else if (videoId.split('-').length === 3) {
            rabbitmqChannel.ack(msg);
        } else {
            rabbitmqChannel.ack(msg);
        }
        
    }

    function onTranscribeVideoFailed(msg) {
        const { videoId } = parseMessageContent(msg);
        console.log('video transcribe failed', videoId)
        Video.findByIdAndUpdate(videoId, { $set: { AITranscriptionLoading: false, transcribeEndTime: Date.now() }})
        .then(() => Video.findById(videoId))
        .then((video) => {
            video = video.toObject();
            if (video.status !== 'proofreading') {
                return;
            }
            const event = { room: websocketsRooms.getOrganizationRoom(video.organization), event: `${websocketsEvents.AI_TRANSCRIBE_VIDEO_FINISH}/${video._id}`, data: video};
            const event2 = { room: websocketsRooms.getOrganizationRoom(video.organization), event: `${websocketsEvents.AI_TRANSCRIBE_VIDEO_FINISH}`, data: video };
            websocketsService.emitEvent(event)
            websocketsService.emitEvent(event2)
            rabbitmqChannel.ack(msg);
        })
        .catch(err => {
            console.log('error updating video stauts to failed', err);
            rabbitmqChannel.ack(msg);
        })
    }

    function syncTranslationArticlesMediaWithOriginal(originalArticleId) {
        return new Promise((resolve, reject) => {
            let originalArticle;
            articleService.findById(originalArticleId)
                .then((originalArticleDoc) => {
                    if (!originalArticleDoc) throw new Error('Invalid article id');
                    originalArticle = originalArticleDoc.toObject();
                    return articleService.find({ originalArticle: originalArticleId, articleType: 'translation' })
                })
                .then((translationArticles) => {
                    if (!translationArticles || translationArticles.length === 0) return resolve();
                    const updateArticleFuncArray = [];
                    translationArticles.forEach((article) => {
                        article = article.toObject();
                        updateArticleFuncArray.push((cb) => {
                            //   Update background music slides video/audio
                            article.slides.forEach((slide) => {
                                slide.content.forEach((subslide) => {
                                    const origianlSubslide = originalArticle.slides.find(s => s.position === slide.position).content.find(s => s.position === subslide.position);
                                    // overwrite media/video data
                                    subslide.media = origianlSubslide.media;
                                    // For bacgkround music slides, overwrite audio data
                                    if (subslide.speakerProfile && subslide.speakerProfile.speakerNumber === -1) {
                                        subslide.audio = origianlSubslide.audio;
                                        subslide.audioKey = origianlSubslide.audioKey;
                                    }
                                })
                            })
                            articleService.update({ _id: article._id }, { slides: article.slides })
                                .then(() => {
                                    cb();
                                })
                                .catch(err => {
                                    console.log('error updating article', err);
                                    cb();
                                })
                        })
                    })
                    async.series(updateArticleFuncArray, () => {
                        console.log('done updating translate articles')
                        resolve();
                    })
                })
                .catch(reject);
        })
    }

    function onWhatsappCutVideoStarted(msg) {
        rabbitmqChannel.ack(msg);
        const { videoId } = parseMessageContent(msg);
        Video.findById(videoId)
        .then(video => {
            if (!video) throw new Error('Invalid video id');
            return Video.findByIdAndUpdate(videoId, { $set: { status: 'transcriping' } })
        })
        .then((a) => {
            console.log('onWhatsappCutVideoStarted', a)
        })
        .catch(err => {
            console.log(err);
        })
    }

    function onWhatsappCutVideoDone(msg) {
        rabbitmqChannel.ack(msg);
        const { videoId, slides, status } = parseMessageContent(msg);
        let video;
        Video.findById(videoId)
        .then(v => {
            video = v;
            if (video.status !== 'transcriping') {
                console.log('video was already updated on the platform', video);
                return Promise.resolve();
            }
            if (status === 'cancelled') {
                return Video.findByIdAndUpdate(videoId, { $set: { status: 'uploaded' }})
            }

            const formattedSlides = generateSlidesFromWhatsappResponse(slides);
            let speakersProfile = [];
            for (let i = 0; i < video.numberOfSpeakers; i++) {
                speakersProfile.push({
                    speakerNumber: i + 1,
                    speakerGender: 'male'
                })
            }
            const newArticle = {
                title: video.title,
                version: 1,
                slides: formattedSlides,
                video: video._id,
                numberOfSpeakers: video.numberOfSpeakers,
                langCode: video.langCode,
                speakersProfile,
                organization: video.organization,
                archived: false,
                articleType: 'original'
            }
            return articleService.create(newArticle)
            .then((a) => {
                console.log('onWhatsappCutVideoDone article created', a)
                return Video.findByIdAndUpdate(videoId, { $set: { status: 'proofreading', article: a._id }})
            })
            .then(() => {
                websocketsService.emitEvent({ room: websocketsRooms.getOrganizationRoom(video.organization), event: websocketsEvents.VIDEO_TRANSCRIBED, data: video })
            })
            .catch(err => {
                console.log('onWhatsappCutVideoDone', err)
            })
        })
        .catch(err => {
            console.log(err);
        })
    }


    function onWhatsappTranscribeVideoDone(msg) {
        rabbitmqChannel.ack(msg);
        const { videoId, slides, status } = parseMessageContent(msg);
        Video.findById(videoId)
        .then(video => {
            if (!video) throw new Error('Invalid video id');
            if (!video.article) throw new Error('No Article is associated with the video');
            if (video.status !== 'proofreading') {
                console.log('onWhatsappTranscribeVideoDone video was already updated on the platform', video);
                return Promise.resolve();
            }
            if (status === 'cancelled') {
                // Nothing to do
                return Promise.resolve({ status });
            }
            const formattedSlides = generateSlidesFromWhatsappResponse(slides);
            return articleService.update({ _id: video.article }, { slides: formattedSlides });
        })
        .then((a) => {
            console.log('onWhatsappTranscribeVideoDone', a)
        })
        .catch(err => {
            console.log(err);
        })
    }

    function generateSlidesFromWhatsappResponse(slides) {
        const formattedSlides = slides && Array.isArray(slides) ? slides.slice().sort(s => s.startTime - s.endTime).map((slide, index) => {
            return {
                position: index,
                content: [{
                    position: 0,
                    text: slide.text || '',
                    startTime: slide.startTime,
                    endTime: slide.endTime,
                    speakerProfile: {
                        speakerNumber: slide.silent ? -1 : slide.speakerNumber,
                        speakerGender: 'male',
                    }
                }]
            }
        }) : [];

        return formattedSlides;
    }

    function onExtractVoiceFinish(msg) {
        const { id, status, url } = parseMessageContent(msg);
        console.log('extracting voice finished', parseMessageContent(msg));

        if (status === 'failed') {
            let videoId;
            return articleService.findById(id)
            .then(a => {
                videoId = a.video
                return Video.findByIdAndUpdate(a.video, { $set: { status: 'cutting' }})
            })
            .then(() => Video.findById(videoId))
            .then((v) => {
                websocketsService.emitEvent({ _id: video.cuttingRequestBy, event: websocketsEvents.AUTOMATIC_VIDEO_BREAKING_DONE, data: v });
                rabbitmqChannel.ack(msg);
            })
            .catch(err => {
                console.log(err);
                rabbitmqChannel.ack(msg);
            })
        }
        workers.audioProcessorWorker.processRecordedAudioViaApi({ url, outputFormat: 'mp3' })
            .then(fileBuffer => {
                return new Promise((resolve, reject) => {
                    audioFileName = `${uuid()}.${url.split(".").pop()}`;
                    fs.writeFile(audioFileName, fileBuffer, (err) => {
                        if (err) {
                            console.log(err);
                        }
                        storageService.saveFile('extractedVoice', `${uuid()}-${audioFileName}`, fs.createReadStream(audioFileName))
                            .then(uploadRes => {
                                fs.unlink(audioFileName, (err) => {
                                    console.log(err);
                                });
                                return resolve(uploadRes);
                            })
                            .catch(reject);
                    });
                });
            })
            .then(uploadRes => {
                rabbitmqChannel.ack(msg);
                workers.automaticVideoBreakWorker.breakVideoAutomatically({ id, url: uploadRes.url });
            })
            .catch(err => {
                console.log('err process audio', err);
                // IF babbellabs failed, just resume the flow
                workers.automaticVideoBreakWorker.breakVideoAutomatically({ id, url });
                rabbitmqChannel.ack(msg);
            });
    }

    function onBreakVideoFinish(msg) {
        console.log('==============================onBreakVideoFinish============================');
        const { id, status, formattedSlides } = parseMessageContent(msg);

        const articleId = id;
        let article;
        let video;
        let defaultSpeakerProfile;
        articleService.findById(articleId)
            .then(a => {
                article = a;
                defaultSpeakerProfile = article.speakersProfile && article.speakersProfile[0] ? article.speakersProfile[0] : {
                    speakerNumber: 1,
                    speakerGender: 'male'
                } ;
                return Video.findById(article.video)
            })
            .then(v => {
                video = v;
                if (!formattedSlides || formattedSlides.length === 0 || status === 'failed') {
                    return Promise.resolve();
                }
                let slides = [];
                formattedSlides.forEach(slide => {
                    slides.push({
                        content: [
                            {
                                position: 0,
                                startTime: slide.start,
                                endTime: slide.stop,
                                speakerProfile: slide.type === 'speech' ? defaultSpeakerProfile : { speakerNumber: -1 },
                            }
                        ]
                    })
                })
                slides = slides.map((s, i) => ({ ...s, position: i }));
                return articleService.findByIdAndUpdate(articleId, { slides } )
            })
            .then(() => {
                const update = {
                    status: 'cutting',
                }
                if (video.cuttingBy === 'self') {
                    update.cuttingEndTime = Date.now()
                }
                return Video.findByIdAndUpdate(video._id, { $set: update })
            })
            .then(() => Video.findById(video._id))
            .then((v) => {
                // websocketsService.emitEvent({ _id: video.cuttingRequestBy, event: websocketsEvents.AUTOMATIC_VIDEO_BREAKING_DONE, data: v });
                // event for break video tab
                const event1 = { room: websocketsRooms.getOrganizationRoom(video.organization), event: `${websocketsEvents.AUTOMATIC_VIDEO_BREAKING_DONE}`, data: v };
                // event for proofreading microapp
                const event2 = { room: websocketsRooms.getOrganizationRoom(video.organization), event: `${websocketsEvents.AUTOMATIC_VIDEO_BREAKING_DONE}/${video._id}`, data: v };
                websocketsService.emitEvent(event1);
                websocketsService.emitEvent(event2);

                rabbitmqChannel.ack(msg);
            })
            .catch(err => {
                console.log(err);
                rabbitmqChannel.ack(msg);
                // res.status(400).send(err.message)
            });
    }

}


function notifyWhatsappVideoAvailableToCut(video) {
    return rabbitmqChannel.sendToQueue(WHATSAPP_VIDEO_AVAILABLE_TO_CUT_QUEUE, Buffer.from(JSON.stringify(video)));
}

module.exports = {
    init,
    notifyWhatsappVideoAvailableToCut,
}