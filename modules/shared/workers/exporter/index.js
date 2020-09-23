const queues = require("../vendors/rabbitmq/queues");

module.exports = ({ rabbitmqChannel }) => {
  function convertVideoToArticle(params) {
    return rabbitmqChannel.sendToQueue(
      queues.CONVERT_VIDEO_TO_ARTICLE_QUEUE,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }

  function exportArticleTranslation(params) {
    return rabbitmqChannel.sendToQueue(
      queues.EXPORT_ARTICLE_TRANSLATION,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }

  function archiveArticleTranslationAudios({ id, slides, title, langCode }) {
    return rabbitmqChannel.sendToQueue(
      queues.ARCHIVE_ARTICLE_TRANSLATION_AUDIOS,
      new Buffer(JSON.stringify({ id, slides, title, langCode })),
      { persistent: true }
    );
  }

  function burnTranslatedArticleVideoSubtitle({
    id,
    videoUrl,
    langCode,
    langName,
    title,
    dir,
    subtitles,
  }) {
    return rabbitmqChannel.sendToQueue(
      queues.BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE,
      new Buffer(
        JSON.stringify({
          id,
          videoUrl,
          langCode,
          langName,
          title,
          dir,
          subtitles,
        })
      ),
      { persistent: true }
    );
  }

  function generateTranslatedArticleSubtitles(params) {
    return rabbitmqChannel.sendToQueue(
      queues.GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }

  function generateVideoThumbnail(params) {
    return rabbitmqChannel.sendToQueue(
      queues.GENERATE_VIDEO_THUMBNAIL_QUEUE,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }
  function updateArticleSlideVideoSlice(params) {
    return rabbitmqChannel.sendToQueue(
      queues.UPDATE_ARTICLE_SLIDE_VIDEO_SLICE,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }
  function updateArticleVideoSpeed(params) {
    return rabbitmqChannel.sendToQueue(
      queues.UPDATE_ARTICLE_VIDEO_SPEED,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }

  function updateArticleSlideVideoSpeed(params) {
    return rabbitmqChannel.sendToQueue(
      queues.UPDATE_ARTICLE_SLIDE_VIDEO_SPEED,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }

  function burnTranslatedArticleVideoSubtitleAndSignlanguage(params) {
    return rabbitmqChannel.sendToQueue(
      queues.BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_AND_SIGNLANGUAGE,
      new Buffer(JSON.stringify(params)),
      { persistent: true }
    );
  }

  function exportImageTranslation({
    id,
    imageUrl,
    originalWidth,
    originalHeight,
    displayWidth,
    displayHeight,
    groups,
  }) {
    return rabbitmqChannel.sendToQueue(
      queues.EXPORT_IMAGE_TRANSLATION_QUEUE,
      new Buffer(
        JSON.stringify({
          id,
          imageUrl,
          originalWidth,
          originalHeight,
          displayWidth,
          displayHeight,
          groups,
        })
      ),
      { persistent: true }
    );
  }

  return {
    convertVideoToArticle,
    exportArticleTranslation,
    archiveArticleTranslationAudios,
    burnTranslatedArticleVideoSubtitle,
    generateTranslatedArticleSubtitles,
    generateVideoThumbnail,
    updateArticleSlideVideoSlice,
    updateArticleVideoSpeed,
    updateArticleSlideVideoSpeed,
    burnTranslatedArticleVideoSubtitleAndSignlanguage,
    exportImageTranslation,
  };
};
