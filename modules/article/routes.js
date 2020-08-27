const controller = require('./controller');
const middlewares = require('./middlewares');
// external modules should call the mount function and pass it an instance 
// of the router to add the module's routes to it
const mount = function (router) {
    // Define module routes here
    router.get('/whatsapp-bot', controller.getArticleForWhatsApp);
    router.get('/count', controller.getArticlesCount)
    router.get('/by_video_id', controller.getByVideoId);
    router.get('/translations', controller.getArticlesTranslations);

    router.get('/translations/count', controller.getTranslationsCount)
    // TODO: DOC THIS
    router.get('/translations/by_user', controller.getUserTranslations)
    router.get('/translations/single', controller.getSingleArticleTranslations);

    router.get('/transcriptionVersions', controller.getTranscriptionVersions)
    router.post('/:articleId/transcriptionVersions/setTranscriptionVersionForSubslide', controller.setTranscriptionVersionForSubslide)
    router.post('/:articleId/transcriptionVersions/setTranscriptionVersionForAllSubslides', controller.setTranscriptionVersionForAllSubslides)

    // proofreading stage update routes
    router.post('/:articleId/slides/:slidePosition/content/:subslidePosition/split', middlewares.authorizeArticleUpdate, controller.splitSubslide);
    router.patch('/:articleId/slides/:slidePosition/content/:subslidePosition', middlewares.authorizeArticleUpdate, controller.updateSubslide);
    router.post('/:articleId/slides/:slidePosition/content/:subslidePosition', middlewares.authorizeArticleUpdate, controller.addSubslide);
    router.delete('/:articleId/slides/:slidePosition/content/:subslidePosition', middlewares.authorizeArticleUpdate, controller.deleteSubslide);

    router.post('/:articleId/text/replace', middlewares.authorizeArticleUpdate, controller.replaceArticleText);
    router.post('/:articleId/automatedBreak', middlewares.authorizeArticleUpdate, controller.automaticBreakArticle);

    router.post('/:articleId/subscribeAITranscribeFinish', middlewares.authorizeArticleUpdate, controller.subscribeAITranscribeFinish);

    // router.post('/:articleId/slides/text/replace', )
    router.put('/:articleId/speakersProfile', middlewares.authorizeArticleUpdate, controller.updateSpeakersProfile);

    router.put('/:articleId/toEnglish', middlewares.authorizeArticleUpdate, controller.updateToEnglish);
    router.put('/:articleId/reviewCompleted', middlewares.authorizeArticleUpdate, controller.updateReviewCompleted);

    router.put('/:articleId/translators', middlewares.authorizeArticleAdmin, controller.updateTranslators)
    router.put('/:articleId/textTranslators', middlewares.authorizeArticleAdmin, controller.updateTextTranslators)
    router.put('/:articleId/projectLeaders', middlewares.authorizeArticleAdmin, controller.updateProjectLeaders)

    router.put('/:articleId/verifiers', middlewares.authorizeArticleAdmin, controller.updateVerifiers)
    router.post('/:articleId/verifiers/resendEmail', middlewares.authorizeArticleAdmin, controller.resendEmailToVerifier)

    router.patch('/:articleId/translators/finishDate', middlewares.authorizeFinishdateUpdate, controller.updateTranslatorFinishDate)

    // TODO: DOC THIS
    router.get('/:articleId/comments', controller.getArticleComments);
    router.get('/', controller.getArticles)
    router.get('/:articleId', controller.getById);
    router.delete('/:articleId', middlewares.authorizeArticleAdmin, controller.deleteArticle)

    return router;
}

module.exports = {
    mount,
}
