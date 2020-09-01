const Article = require('../shared/models').Article;
const VIDEOWIKI_WHATSAPP_NUMBER = process.env.VIDEOWIKI_WHATSAPP_NUMBER;
const { userService } = require('../shared/services');
const async = require('async');

function formatSubslideToSubtitle(subslide) {
    return ({ ...subslide, startTime: subslide.startTime * 1000, endTime: subslide.endTime * 1000, text: subslide.text, speakerNumber: subslide.speakerProfile.speakerNumber })
}
function getOverlappedSubslide({ startTime, endTime }, slides, skipPositions = []) {
    const subslides = slides.reduce((acc, s) => s.content && s.content.length > 0 ? acc.concat(s.content.map((ss) => ({ ...ss, slidePosition: s.position, subslidePosition: ss.position }))) : acc, []);
    skipPositions = skipPositions.map(s => ({ slidePosition: parseInt(s.slidePosition), subslidePosition: parseInt(s.subslidePosition) }));
    const skipSlidePositions = skipPositions.map(s => s.slidePosition);
    const skipSubslidePositions = skipPositions.map(s => s.subslidePosition);

    return subslides.find(s => {
        // Skip positions
        if (skipSlidePositions.indexOf(s.slidePosition) !== -1 && skipSubslidePositions[skipSlidePositions.indexOf(s.slidePosition)] === s.subslidePosition) {
            return false;
        }
        // exact startTime/endTime
        if (s.startTime === startTime || s.endTime === endTime) return true;
        // new subtitle is dropped in the range of another subtitle
        if (endTime < s.endTime && startTime > s.startTime) return true;
        // new subtite startTime is within another subtitle
        if (s.startTime < startTime && s.endTime > startTime) return true;
        // new subtite endTime is within another subtitle
        if (s.startTime < endTime && s.endTime > endTime) return true;


        return false;
    });
}
function validateAddSubslide(article, slidePosition, subslidePosition, startTime, endTime, speakerProfile) {
    // if (!article.slides[slideIndex]) return { valid: false, message: 'Invalid slide index ' };
    if (startTime === undefined || !endTime) return { valid: false, message: 'Invalid start or end time' };
    // Check for new subslide being in the same timespan of another one
    const speakerValid = article.speakersProfile.map((s) => s.speakerNumber).indexOf(speakerProfile.speakerNumber) !== -1 || speakerProfile.speakerNumber === -1;
    if (!speakerValid) return { valid: false, message: 'Invalid speaker number' };
    const { slides } = article;
    startTime = startTime * 1000;
    endTime = endTime * 1000;
    if (slides.length > 0 && slides[0].content.length !== 0) {
        const { valid } = validateSlideAndSubslidePosition(article, slidePosition, subslidePosition);
        if (!valid) return validateSlideAndSubslidePosition(article, slidePosition, subslidePosition);
    }

    const positionInvalid = slides.reduce((acc, slide, slideIndex) => acc.concat(slide.content.map((s, subslideIndex) => ({ ...s, slideIndex, subslideIndex }))), [])
        .map(formatSubslideToSubtitle).find(s => s.startTime === startTime || s.endTime === endTime || (endTime < s.endTime && startTime > s.startTime))
    if (positionInvalid) return { valid: false, message: 'Invalid slide position' };
    return { valid: true };
}

function validateTranslatorsUpdate(translators) {
    if (!translators || !Array.isArray(translators)) return { valid: false, message: 'translators must be an array' };
    if (translators.length === 0) return { valid: true };
    if (translators.some((t) => t.speakerNumber === undefined || t.speakerNumber === -1)) return { valid: false, message: 'Invalid format: { speakerNumber: number, user: userId }' }
    return { valid: true };
}
function validateSpeakersProfileUpdate(speakersProfile) {
    if (!speakersProfile || !Array.isArray(speakersProfile)) return { valid: false, message: 'speakersProfile must be an array' };
    if (speakersProfile.length > 10) return { valid: false, message: 'Max number of speakers is 10' };
    let hasGender = true;
    speakersProfile.forEach((speaker) => {
        if (!speaker.speakerGender) {
            hasGender = false;
        }
    })
    if (!hasGender) return { valid: false, message: 'Speakers must have a gender' };
    return { valid: true };
}

function validateSlideAndSubslidePosition(article, slidePosition, subslidePosition) {
    slidePosition = parseInt(slidePosition);
    subslidePosition = parseInt(subslidePosition);

    if (!article.slides.find((s) => parseInt(s.position) === slidePosition)) return { valid: false, message: 'Invalid slide index' };
    if (!article.slides.find((s) => parseInt(s.position) === slidePosition).content.find((s) => parseInt(s.position) === subslidePosition)) return { valid: false, message: 'invalid subslide index' };
    // const keys = Object.keys(changes);
    let valid = true;
    let message = '';
    // let subslideItem = article.slides.find(s => s.position === slidePosition).content.find(s => s.position === subslidePosition);
    // keys.forEach((key) => {
    //     if (key === 'startTime' || key === 'endTime') {
    //         const overlappedSubtitle = getOverlappedSubslide({ [key]: changes[key] }, article.slides, [{ slidePosition, subslidePosition }]);
    //         if (overlappedSubtitle) {
    //             if (!(parseInt(overlappedSubtitle.slidePosition) === parseInt(slidePosition) && parseInt(overlappedSubtitle.subslidePosition) === parseInt(subslidePosition))) {
    //                 valid = false;
    //                 message =  `${key} is overlapping with another subtitle`;
    //             }
    //         }
    //         if (key === 'startTime' && subslideItem.endTime < changes[key]) {
    //             valid = false;
    //             message = 'Start time cannot be larger than end time';
    //         }
    //         if (key === 'endTime' && subslideItem.startTime > changes[key]) {
    //             valid = false
    //             message = 'End time cannot be less than start time';
    //         }                
    //     }
    // })
    return { valid, message };
}

function validateSubslideUpdate(article, slidePosition, subslidePosition, changes) {
    if (!changes) return { valid: false, message: 'Invalid fields' };
    return validateSlideAndSubslidePosition(article, slidePosition, subslidePosition, changes);
}

function validateSubslideDelete(article, slidePosition, subslidePosition) {
    return validateSlideAndSubslidePosition(article, slidePosition, subslidePosition);
}


function getSlideAndSubslideIndexFromPosition(slides, slidePosition, subslidePosition) {
    const slideIndex = slides.findIndex((s) => parseInt(s.position) === parseInt(slidePosition));
    if (slideIndex === -1) return {};
    const subslideIndex = slides[slideIndex].content.findIndex((s) => parseInt(s.position) === parseInt(subslidePosition));
    return { slideIndex, subslideIndex };
}

function reorderSlidesAndContent(slides) {
    slides.forEach((slide, slideIndex) => {
        slide.position = slideIndex;
        if (slide.content) {
            slide.content = slide.content.sort((a, b) => a.startTime - b.startTime);
            slide.content.forEach((subslide, subslideIndex) => {
                subslide.position = subslideIndex;
            })
        }
    })

    return slides;
}

function addSubslide(id, slidePosition, subslidePosition, subslide) {
    return new Promise((resolve, reject) => {
        Article.findById(id)
            .then((article) => {
                if (!article) throw new Error('Invalid article');
                article = article.toObject();
                const { slides } = article;
                let { slideIndex, subslideIndex } = getSlideAndSubslideIndexFromPosition(slides, slidePosition, subslidePosition);
                if (slideIndex == undefined) {
                    slideIndex = 0
                }
                if (subslideIndex === undefined) {
                    subslideIndex = 0;
                }
                if (slides[slideIndex]) {
                    slides[slideIndex].content.splice(subslideIndex, 0, subslide)
                } else {
                    slides[slideIndex] = { content: [subslide] };
                }
                // Re-order slide content positions
                slides[slideIndex].content = slides[slideIndex].content.map((subslide, index) => ({ ...subslide, position: index }));

                return Article.update({ _id: id }, { $set: { slides: reorderSlidesAndContent(slides) } })
            })
            .then(r => resolve(r))
            .catch(reject)
    })
}

function updateSubslideUsingPosition(id, slidePosition, subslidePosition, changes) {
    return new Promise((resolve, reject) => {
        Article.findById(id)
            .then((article) => {
                if (!article) throw new Error('Invalid article');
                article = article.toObject();
                const { slides } = article;
                const { slideIndex, subslideIndex } = getSlideAndSubslideIndexFromPosition(slides, slidePosition, subslidePosition);
                const subslides = slides.reduce((acc, s) => s.content ? acc.concat(s.content.map((ss) => ({ ...ss, slidePosition: s.position, subslidePosition: ss.position }))) : acc, []).sort((a, b) => a.startTime - b.startTime).map((s, index) => ({ ...s, index }));
                let update = {}
                Object.keys(changes).forEach((key) => {
                    if (key === 'text') {
                        changes[key] = changes[key].split('.').map(s => s.trim()).join('. ');
                    } else if (key === 'startTime' || key === 'endTime') {
                        const itemIndex = subslides.findIndex(s => s.slidePosition === parseInt(slidePosition) && s.subslidePosition === parseInt(subslidePosition));
                        const prevItem = subslides[itemIndex - 1];
                        const nextItem = subslides[itemIndex + 1];

                        if (key === 'startTime') {
                            if (changes[key] > (changes['endTime'] || subslides[itemIndex].endTime)) {
                                throw new Error('Start time cannot be larger than end time');
                            }
                            if (prevItem && changes[key] < prevItem.endTime) {
                                changes[key] = prevItem.endTime;
                            }
                        } else if (key === 'endTime') {
                            if (changes[key] < (changes['startTime'] || subslides[itemIndex].startTime)) {
                                throw new Error('End time cannot be less than start time');
                            }
                            if (nextItem && changes[key] > nextItem.startTime) {
                                changes[key] = nextItem.startTime;
                            }
                        }
                    }
                    update[`slides.${slideIndex}.content.${subslideIndex}.${key}`] = changes[key];
                })

                return Article.update({ _id: article._id }, { $set: update });
            })
            .then(() => resolve(changes))
            .catch(reject);
    })
}

function splitSubslide(id, slidePosition, subslidePosition, wordIndex, time) {
    return new Promise((resolve, reject) => {
        Article.findById(id)
            .then((article) => {
                if (!article) throw new Error('Invalid article id');
                article = article.toObject();
                const { slides } = article;
                const { slideIndex, subslideIndex } = getSlideAndSubslideIndexFromPosition(slides, slidePosition, subslidePosition);
                const splittedSubslide = slides[slideIndex].content[subslideIndex];
                // const subslideDuration = splittedSubslide.endTime - splittedSubslide.startTime;
                let newSubslides = [
                    {
                        ...splittedSubslide,
                        text: splittedSubslide.text.split(' ').slice(0, wordIndex).join(' '),
                        startTime: splittedSubslide.startTime,
                        endTime: time,
                    },
                    {
                        ...splittedSubslide,
                        text: splittedSubslide.text.split(' ').slice(wordIndex).join(' '),
                        startTime: time,
                        endTime: splittedSubslide.endTime,
                    }
                ];
                newSubslides.forEach((s) => {
                    delete s._id;
                })
                slides[slideIndex].content.splice(subslideIndex, 1, ...newSubslides);
                // Re-update indexes
                slides[slideIndex].content = slides[slideIndex].content.map((subslide, index) => {
                    return { ...subslide, position: index };
                })

                return Article.update({ _id: id }, { $set: { slides: reorderSlidesAndContent(slides) } });
            })
            .then(r => resolve(r))
            .catch(reject);
    })
}

function removeSubslide(id, slidePosition, subslidePosition) {
    return new Promise((resolve, reject) => {
        Article.findById(id)
            .then((article) => {
                if (!article) return reject(new Error('Invalid article'));
                article = article.toObject();
                const { slides } = article;
                const { slideIndex, subslideIndex } = getSlideAndSubslideIndexFromPosition(slides, slidePosition, subslidePosition);
                slides[slideIndex].content.splice(subslideIndex, 1);
                return Article.update({ _id: article._id }, { $set: { slides: reorderSlidesAndContent(slides) } })
            })
            .then(r => resolve(r))
            .catch(reject);
    })
}

function replaceArticleSlidesText(id, { find, replace }) {
    return new Promise((resolve, reject) => {
        const slidesChanges = {};
        const changedSlides = [];

        Article
            .findById(id)
            .then((articleDoc) => {
                const article = articleDoc.toObject();
                article.slides.forEach((slide, slideIndex) => {
                    slide.content.forEach((subslide, subslideIndex) => {
                        const specialChars = `\\[|\\$|\\&|\\+|\\,|\\।|\\:|\\;|\\=|\\?|\\@|\\#|\\||\\'|\\<|\\>|\\.|\\^|\\*|\\(|\\)|\\%|\\!|\\-|\\]|\\s`
                        const re = new RegExp(`(${specialChars}|^)${find}(${specialChars}|$)`, 'ig')
                        if (subslide.text && subslide.text.trim().length > 0 && subslide.text.match(re)) {
                            const newText = subslide.text.replace(re, `$1${replace}$2`);
                            slidesChanges[`slides.${slideIndex}.content.${subslideIndex}.text`] = newText;
                            slidesChanges[`slides.${slideIndex}.content.${subslideIndex}.audioSynced`] = false;
                            changedSlides.push({
                                slidePosition: slide.position,
                                subslidePosition: subslide.position,
                                text: newText
                            });
                        }
                    })
                })
                return Article.update({ _id: id }, { $set: slidesChanges })
            })
            .then(() => {
                resolve(changedSlides)
            })
            .catch(reject);
    })
}

function cleanArticleSilentSlides(article) {
    let clonedArticle;
    if (article.toObject) {
        clonedArticle = article.toObject();
    } else {
        clonedArticle = { ...article };
    }
    clonedArticle.slides.forEach(slide => {
        slide.content = slide.content.filter((s) => !s.silent);
    });
    clonedArticle.slides = clonedArticle.slides.filter((s) => s.content.length > 0);
    return clonedArticle;
}

function cleanArticleBackgroundMusicSlides(article) {
    let clonedArticle;
    if (article.toObject) {
        clonedArticle = article.toObject();
    } else {
        clonedArticle = { ...article };
    }
    clonedArticle.slides.forEach(slide => {
        slide.content = slide.content.filter((s) => s.speakerProfile.speakerNumber !== -1);
    });
    clonedArticle.slides = clonedArticle.slides.filter((s) => s.content.length > 0);
    return clonedArticle;
}

function cleanArticleSilentAndBackgroundMusicSlides(article) {
    let clonedArticle;
    if (article.toObject) {
        clonedArticle = article.toObject();
    } else {
        clonedArticle = { ...article };
    }
    return cleanArticleBackgroundMusicSlides(cleanArticleSilentSlides(clonedArticle));
}

function getArticlesWithRelatedUsers(query) {
    return new Promise((resolve) => {
        let articles = [];
        Article.find(query)
        .then(articlesDocs => {

            const fetchArticlesFuncArray = [];
            articlesDocs.forEach(article => {

                fetchArticlesFuncArray.push(cb => {
                    getArticleWithRelatedUsers(article._id)
                    .then(article => {
                        articles.push(article);
                        cb();
                    })
                    .catch(err => {
                        console.log(err);
                        cb();
                    })

                })
            })
            async.parallelLimit(fetchArticlesFuncArray, 10, () => {
                resolve(articles)
            })
        })
    })
}

function getArticleWithRelatedUsers(articleId) {
    return new Promise((resolve, reject) => {
        let article;
        const usersMap = {};
        Article.findById(articleId)
        .then(articleDoc => {
            // textTranslators
            article = articleDoc.toObject();
            return new Promise((resolve) => {
                const fetchTextTransaltorsFuncArray = [];
                article.textTranslators.forEach(t => {
                    fetchTextTransaltorsFuncArray.push(cb => {
                        if (usersMap[t.user]) {
                            return setTimeout(() => {
                                t.user = usersMap[t.user];
                                cb();
                            });
                        }
                        userService.findById(t.user)
                        .then(user => {
                            usersMap[t.user] = user;
                            t.user = user;
                            cb();
                        })
                        .catch(err => {
                            console.log(err);
                            cb();
                        })
                    })
                })
                async.parallelLimit(fetchTextTransaltorsFuncArray, 10, () => {
                    resolve();
                })
            })
        })
        .then(() => {
            // translators
            return new Promise((resolve) => {
                const fetchTextTransaltorsFuncArray = [];
                article.translators.forEach(t => {
                    fetchTextTransaltorsFuncArray.push(cb => {
                        if (usersMap[t.user]) {
                            return setTimeout(() => {
                                t.user = usersMap[t.user];
                                cb();
                            });
                        }
                        userService.findById(t.user)
                        .then(user => {
                            usersMap[t.user] = user;
                            t.user = user;
                            cb();
                        })
                        .catch(err => {
                            console.log(err);
                            cb();
                        })
                    })
                })
                async.parallelLimit(fetchTextTransaltorsFuncArray, 10, () => {
                    resolve();
                })
            })
        })
        .then(() => {
            // verifiers
            return new Promise((resolve) => {
                const fetchTextTransaltorsFuncArray = [];
                article.verifiers.forEach((v, index) => {
                    fetchTextTransaltorsFuncArray.push(cb => {
                        if (usersMap[v]) {
                            return setTimeout(() => {
                                article.verifiers[index] = usersMap[v];
                                cb();
                            });
                        }
                        userService.findById(v)
                        .then(user => {
                            usersMap[v] = user;
                            article.verifiers[index] = user;
                            cb();
                        })
                        .catch(err => {
                            console.log(err);
                            cb();
                        })
                    })
                })
                async.parallelLimit(fetchTextTransaltorsFuncArray, 10, () => {
                    resolve();
                })
            })
        })
        .then(() => {
            // Project leaders 
            return new Promise((resolve) => {
                const fetchTextTransaltorsFuncArray = [];
                article.projectLeaders.forEach(t => {
                    fetchTextTransaltorsFuncArray.push(cb => {
                        if (usersMap[t.user]) {
                            return setTimeout(() => {
                                t.user = usersMap[t.user];
                                cb();
                            });
                        }
                        userService.findById(t.user)
                        .then(user => {
                            usersMap[t.user] = user;
                            t.user = user;
                            cb();
                        })
                        .catch(err => {
                            console.log(err);
                            cb();
                        })
                    })
                })
                async.parallelLimit(fetchTextTransaltorsFuncArray, 10, () => {
                    resolve();
                })
            })
        })
        .then(() => resolve(article))
        .catch(err => reject(err));
    })
} 

function generateWhatsappTranscribeLink(videoId) {
  if (!VIDEOWIKI_WHATSAPP_NUMBER) {
      return '';
  }
  return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi breakvideo-${videoId}`}`;
}

function generateWhatsappProofreadLink(videoId) {
  if (!VIDEOWIKI_WHATSAPP_NUMBER) {
      return '';
  }
  return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi transcribevideo-${videoId}`}`;
}


function generateWhatsappTranslateLink(videoId, langTo) {
  if (!VIDEOWIKI_WHATSAPP_NUMBER) {
      return '';
  }
  return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi translatevideo-${videoId}-${langTo}`}`;
}

function getWhatsappNotifyOnProofreadingReady(videoId) {
  if (!VIDEOWIKI_WHATSAPP_NUMBER) {
      return '';
  }
  return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi notifyonproofreadingready-${videoId}`}`;
}
module.exports = {
    validateSubslideDelete,
    validateSubslideUpdate,
    validateSlideAndSubslidePosition,
    validateSpeakersProfileUpdate,
    validateTranslatorsUpdate,
    validateAddSubslide,
    getOverlappedSubslide,
    addSubslide,
    updateSubslideUsingPosition,
    splitSubslide,
    removeSubslide,
    replaceArticleSlidesText,
    cleanArticleSilentAndBackgroundMusicSlides,
    generateWhatsappProofreadLink,
    generateWhatsappTranscribeLink,
    generateWhatsappTranslateLink,
    getWhatsappNotifyOnProofreadingReady,
    getArticleWithRelatedUsers,
    getArticlesWithRelatedUsers,
}