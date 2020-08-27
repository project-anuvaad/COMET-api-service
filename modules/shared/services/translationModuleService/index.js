const path = require('path');
const fs = require('fs');
const uuid = require('uuid').v4;
const async = require('async');
const articleService = require('../article');
const TRANSLATION_AUDIO_DIRECTORY = 'translation/audios';

const storageService = require('../storage');
const articleHandler = require('../../dbHandlers/article');
const ttsVendor = require('../../vendors/textToSpeach');

class TranslationService {

    createTranslatableArticle(articleId, userId, lang) {
        return new Promise((resolve, reject) => {

            articleHandler.findById(articleId)
                .then((article) => {
                    article = article.toObject();
                    article.originalArticle = article._id;
                    article.langCode = lang;
                    // article.translators = [userId];
                    article.articleType = 'translation';
                    delete article._id;
                    article.slides.forEach((slide) => {
                        slide.content.forEach((subslide) => {
                            subslide.audio = '';
                        })
                    });

                    return articleHandler.create(article);
                })
                .then(resolve)
                .catch(reject);
        })
    }

    validateArticleExport(article) {
        if (article.articleType !== 'translation') return { valid: false, message: 'Only Translation articles can be exported' };
        const { slides } = article;
        const allSubslides = slides.filter((s) => s.content && s.content.length > 0).reduce((acc, s) => acc.concat(s.content), []).filter((s) => !s.silent && s.speakerProfile.speakerNumber !== -1);
        if (allSubslides.every((subslide) => subslide.text && subslide.audio)) return { valid: true };
        if (article.signLang && allSubslides.every(sub => sub.picInPicVideoUrl)) return { valid: true };
        if (article.signLang) {
            return { valid: false, message: 'All slides should have videos' };
        }

        return { valid: false, message: 'All slides should have audio and text' }
    }


    getSpeakersProfileSpeechMapping(speakersProfile, lang) {
        const googleVoicesIds = { ...ttsVendor.GOOGLE_VOICES_IDS };
        const awsVoicesIds = { ...ttsVendor.AWS_VOICES_IDS };
        const voiceIds = {
            google: googleVoicesIds,
            aws: awsVoicesIds,
        }
        if (!googleVoicesIds[lang] && !awsVoicesIds[lang]) throw new Error('Unsupported lang');

        const speechMap = [];
        const lastIndexMap = {
            male: 0,
            female: 0,
        }
        const vendorsMap = {
            male: 'google',
            female: 'google',
        }

        speakersProfile.forEach((speaker) => {
            let { speakerGender } = speaker;
            speakerGender = speakerGender.toLowerCase();
            if (voiceIds[vendorsMap[speakerGender]][lang][speakerGender][lastIndexMap[speakerGender]]) {
                speechMap.push({ speaker, vendor: vendorsMap[speakerGender], voiceId: voiceIds[vendorsMap[speakerGender]][lang][speakerGender][lastIndexMap[speakerGender]] })
            } else {
                if (vendorsMap[speakerGender] === 'google') {
                    vendorsMap[speakerGender] = 'aws';
                } else {
                    vendorsMap[speakerGender] = 'google';
                }
                lastIndexMap[speakerGender] = 0;
                speechMap.push({ speaker, vendor: vendorsMap[speakerGender], voiceId: voiceIds[vendorsMap[speakerGender]][lang][speakerGender][lastIndexMap[speakerGender]] });
            }
            lastIndexMap[speakerGender]++;
        })
        return speechMap;
    }

    generateSlideTextToSpeech(article, slidePosition, subslidePosition) {
        return new Promise((resolve, reject) => {
            const subslide = article.slides.find(s => parseInt(s.position) === parseInt(slidePosition)).content.find(s => parseInt(s.position) === parseInt(subslidePosition));
            if (!subslide || !subslide.text) return reject('Empty slide');

            const speechMaps = this.getSpeakersProfileSpeechMapping(article.speakersProfile, article.langCode);
            const params = {
                text: subslide.text,
                lang: article.langCode,
            }
            const ttsInfo = speechMaps.find(s => s.speaker.speakerNumber === subslide.speakerProfile.speakerNumber);
            if (ttsInfo) {
                params.vendor = ttsInfo.vendor;
                params.voiceId = ttsInfo.voiceId
            }
            const targetPath = path.join(__dirname, `tts_audio${uuid()}.mp3`);

            ttsVendor.convertTextToSpeech(params, targetPath)
                .then(() => {
                    return resolve(targetPath);
                })
                .catch(reject);
        })
    }

    generateTTSArticle(articleId, langCode) {
        return new Promise((resolve, reject) => {
            let clonedArticle;
            articleService.cloneArticle(articleId)
                .then((clonedArticleDoc) => {
                    clonedArticle = clonedArticleDoc;
                    if (clonedArticle.toObject) {
                        clonedArticle = clonedArticle.toObject();
                    }
                    clonedArticle.slides.forEach(slide => {
                        slide.content.forEach((subslide) => {
                            if (subslide.speakerProfile && subslide.speakerProfile.speakerNumber === -1) {
                            } else {
                                subslide.audio = '';
                            }
                        })
                    });
                    const newArticleUpdate = { articleType: 'translation', langCode, slides: clonedArticle.slides, tts: true, translationProgress: 100, archived: false };
                    newArticleUpdate.tts = true;
                    clonedArticle = {
                        ...clonedArticle,
                        ...newArticleUpdate,
                    }
                    return articleService.update({ _id: clonedArticle._id }, newArticleUpdate);
                })
                .then(() => {
                    return new Promise((resolve, reject) => {
                        const generateTTSFuncArray = [];
                        clonedArticle.slides.forEach((slide) => {
                            slide.content.forEach((subslide) => {
                                generateTTSFuncArray.push(cb => {
                                    let audioPath;
                                    this.generateSlideTextToSpeech(clonedArticle, slide.position, subslide.position)
                                        .then((generateAudioPath) => {
                                            audioPath = generateAudioPath;
                                            return storageService.saveFile(TRANSLATION_AUDIO_DIRECTORY, audioPath.split('/').pop(), fs.createReadStream(audioPath));
                                        })
                                        .then((uploadRes) => {
                                            uploadedAudioUrl = uploadRes.url;
                                            const articleUpdate = {
                                                audio: uploadRes.url,
                                                audioSynced: true,
                                                audioKey: uploadRes.data.Key,
                                                audioFileName: audioPath.split('/').pop(),
                                                audioProcessed: true,
                                            };
                                            return articleService.updateSubslideUsingPosition(clonedArticle._id, slide.position, subslide.position, articleUpdate)
                                        })
                                        .then((doc) => {
                                            fs.unlink(audioPath, (err) => {
                                                if (err) {
                                                    console.log('error dleting tts audio', err);
                                                }
                                            })
                                            cb();
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            if (audioPath) {
                                                fs.unlink(audioPath, (err) => {
                                                    if (err) {
                                                        console.log('error dleting tts audio', err);
                                                    }
                                                })
                                            }
                                            cb();
                                        })
                                })
                            })
                        })
                        async.series(generateTTSFuncArray, (err => {
                            console.log('done generating tts for directly to english article', err)
                            resolve()
                        }))
                    })
                })
                .catch(err => {
                    console.log('err', err);
                    resolve()
                })
        })
    }

}

module.exports = new TranslationService();