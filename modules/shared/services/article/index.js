const articleHandler = require('../../dbHandlers/article');

const BaseService = require('../BaseService');


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


class ArticleService extends BaseService {
    constructor() {
        super(articleHandler);
    }

    addSubslide(id, slidePosition, subslidePosition, subslide) {
        return new Promise((resolve, reject) => {
            articleHandler.findById(id)
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
    
                    return articleHandler.update({ _id: id }, { slides: reorderSlidesAndContent(slides) })
                })
                .then(r => resolve(r))
                .catch(reject)
        })
    }

   updateSubslideUsingPosition(id, slidePosition, subslidePosition, changes) {
        return new Promise((resolve, reject) => {
        articleHandler.findById(id)
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

                return articleHandler.update({ _id: article._id }, update);
            })
            .then(() => resolve(changes))
            .catch(reject);
        })
    }

    splitSubslide(id, slidePosition, subslidePosition, wordIndex, time) {
        return new Promise((resolve, reject) => {
            articleHandler.findById(id)
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
    
                    return articleHandler.update({ _id: id }, { slides: reorderSlidesAndContent(slides) });
                })
                .then(r => resolve(r))
                .catch(reject);
        })
    }

    replaceArticleSlidesText(id, { find, replace }) {
        return new Promise((resolve, reject) => {
            const slidesChanges = {};
            const changedSlides = [];
    
            articleHandler.findById(id)
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
                    return articleHandler.update({ _id: id }, slidesChanges)
                })
                .then(() => {
                    resolve(changedSlides)
                })
                .catch(reject);
        })
    }
    

    removeSubslide(id, slidePosition, subslidePosition) {
    return new Promise((resolve, reject) => {
        articleHandler.findById(id)
            .then((article) => {
                if (!article) return reject(new Error('Invalid article'));
                article = article.toObject();
                const { slides } = article;
                const { slideIndex, subslideIndex } = getSlideAndSubslideIndexFromPosition(slides, slidePosition, subslidePosition);
                slides[slideIndex].content.splice(subslideIndex, 1);
                return articleHandler.update({ _id: article._id }, { slides: reorderSlidesAndContent(slides) })
            })
            .then(r => resolve(r))
            .catch(reject);
        })
    }

    cloneArticle(id) {
        return new Promise((resolve, reject) => {
            articleHandler.findById(id)
            .then((article) => {
                article = article.toObject();
                article.originalArticle = article._id;
                delete article._id;
                return articleHandler.create(article);
            })
            .then(article => {
                return resolve(article)
            })
            .catch(err => {
                return reject(err);
            }) 
        })
    }

    formatSubslideToSubtitle(subslide) {
        return ({ ...subslide, startTime: subslide.startTime * 1000, endTime: subslide.endTime * 1000, text: subslide.text, speakerNumber: subslide.speakerProfile.speakerNumber })
    }


    cleanArticleSilentSlides(article) {
        let clonedArticle;
        if (article.toObject) {
            clonedArticle = article.toObject();
        } else {
            clonedArticle = { ...article };
        }
        clonedArticle.slides.forEach(slide => {
            slide.content = slide.content.filter((s) => !s.silent);
        });
        clonedArticle.slides = clonedArticle.slides.filter((s) => s.content.length > 0);;
        return clonedArticle;
    }

    cleanArticleBackgroundMusicSlides(article) {
        let clonedArticle;
        if (article.toObject) {
            clonedArticle = article.toObject();
        } else {
            clonedArticle = { ...article };
        }
        clonedArticle.slides.forEach(slide => {
            slide.content = slide.content.filter((s) => s.speakerProfile.speakerNumber !== -1);
        });
        clonedArticle.slides = clonedArticle.slides.filter((s) => s.content.length > 0);;
        return clonedArticle;
    }

    cleanArticleSilentAndBackgroundMusicSlides(article) {
        let clonedArticle;
        if (article.toObject) {
            clonedArticle = article.toObject();
        } else {
            clonedArticle = { ...article };
        }
        return this.cleanArticleBackgroundMusicSlides(this.cleanArticleSilentSlides(clonedArticle));
    }
    
    generateTranslatableArticle({ articleId, signLang, lang, langName, tts, createdBy }) {
        return new Promise((resolve, reject) => {
            let originalArticle;
            let clonedArticle;
            this.findById(articleId)
                .then((originalArticleDoc) => {
                    if (!originalArticleDoc) throw new Error('Invalid article id');
                    originalArticle = originalArticleDoc.toObject();
    
                    const query = {
                        originalArticle: originalArticle._id,
                        langCode: lang,
                        archived: false,
                    }
                    if (signLang) {
                        query.signLangCode = lang;
                        query.signLang = true;
                    } else {
                        query.langCode = lang;
                    }
                    if (langName) {
                        query.langName = langName;
                    }
                    if (tts) {
                        query.tts = true;
                    } else {
                        query.tts = false;
                    }
                    return this.find(query)
                })
                .then((articleDoc) => {
                    if (articleDoc && articleDoc.length > 0) return resolve({ article: articleDoc[0].toObject(), originalArticle });
                    this.cloneArticle(articleId)
                        .then((clonedArticleDoc) => {
                            clonedArticle = clonedArticleDoc;
                            if (clonedArticle.toObject) {
                                clonedArticle = clonedArticle.toObject();
                            }
                            clonedArticle.slides.forEach(slide => {
                                slide.content.forEach((subslide) => {
                                    if (subslide.speakerProfile && subslide.speakerProfile.speakerNumber === -1) {
                                        console.log('')
                                    } else {
                                        subslide.audio = '';
                                    }
                                    // For TTS translations make the audio speed 0.8
                                    if (tts) {
                                        subslide.audioSpeed = 0.80;
                                    }
                                })
                            });
                            const newArticleUpdate = { articleType: 'translation', langName, slides: clonedArticle.slides, archived: false };
                            if (signLang) {
                                newArticleUpdate.signLang = true;
                                newArticleUpdate.langName = ''
                                // newArticleUpdate.stage = 'signlanguage_translation';
                                // clonedArticle.stage = 'signlanguage_translation';
                                clonedArticle.signLang = true;
                                clonedArticle.langName = '';
                            } else {
                                newArticleUpdate.stage = 'text_translation';
                                clonedArticle.stage = 'text_translation';
                            }
                            if (createdBy) {
                                clonedArticle.createdBy = createdBy; 
                                newArticleUpdate.createdBy = createdBy;
                            }
                            clonedArticle.langCode = lang
                            newArticleUpdate.langCode = lang;
                            if (tts) {
                                newArticleUpdate.tts = true;
                            }
                            return this.update({ _id: clonedArticle._id }, newArticleUpdate);
                        })
                        .then(() => {
                            return new Promise((resolve, reject) => {
                                // if ()
                                clonedArticle.langCode = lang;
                                if (tts) {
                                    clonedArticle.tts = true;
                                }
                                if (!clonedArticle.signLang && clonedArticle.langCode !== originalArticle.langCode && originalArticle.langCode.indexOf(clonedArticle.langCode) !== 0) {
                                    return resolve(clonedArticle);
                                } else {
                                    this.update({ _id: clonedArticle._id }, { translationProgress: 100 })
                                        .then(() => {
                                            clonedArticle.translationProgress = 100;
                                            return resolve(clonedArticle);
                                        })
                                        .catch(reject)
                                }
                            })
                        })
                        .then((article) => {
                            console.log('Created Article');
                            return resolve({ article: this.cleanArticleSilentAndBackgroundMusicSlides(article), originalArticle, created: true });
                        })
                })
                .catch(err => {
                    return reject(err);
                })
        })
    }

}




module.exports = new ArticleService();