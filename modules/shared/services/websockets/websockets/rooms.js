module.exports = {
    getOrganizationRoom: orgId => `ORGANIZATION/${orgId}`,
    getAITranscribeFinishRoom: (videoId) => `AI_TRANSCRIBE_FINISH/${videoId}`,
    getOnVideoConvertToArticleFinishRoom: (videoId) => `VIDEO_CONVERT_TO_ARTICLE_FINISH`,
}