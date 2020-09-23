const mongoose = require('mongoose');
const { SchemaNames } = require('./Schemas/utils/schemaNames');

const ArticleSchemas = require('./Schemas/Article');
const CommentSchemas = require('./Schemas/Comment');
const VideoSchemas = require('./Schemas/Video');
const ImageSchemas = require('./Schemas/Image');
const ApiKeySchemas = require('./Schemas/ApiKey')
const FolderSchemas = require('./Schemas/Folder');
const NotifiationSchemas = require('./Schemas/Notification');
const OrganizationSchemas = require('./Schemas/Organization');
const SubtitlesSchemas = require('./Schemas/Subtitles');
const UserSchemas = require('./Schemas/User');
const VideoTutorialContributionSchemas = require('./Schemas/VideoTutorialContribution')
const TranslationExportSchemas = require('./Schemas/TranslationExport'); 

const NoiseCancellationVideoSchemas = require('./Schemas/NoiseCancellationVideo');
const SocketConnectionSchemas = require('./Schemas/SocketConnection');
const ImageTranslationExportSchemas = require('./Schemas/ImageTranslationExport')

const Article = mongoose.model(SchemaNames.article, ArticleSchemas.ArticleSchema);
const ApiKey = mongoose.model(SchemaNames.apiKey, ApiKeySchemas.ApiKey)
const Video = mongoose.model(SchemaNames.video, VideoSchemas.VideoSchema);
const Image = mongoose.model(SchemaNames.image, ImageSchemas.ImageSchema);
const Comment = mongoose.model(SchemaNames.comment, CommentSchemas.Comment);
const Folder = mongoose.model(SchemaNames.folder, FolderSchemas.FolderSchema);
const Notification = mongoose.model(SchemaNames.notification, NotifiationSchemas.NotificationSchema);
const Organization = mongoose.model(SchemaNames.organization, OrganizationSchemas.OrganizationSchema);
const Subtitles = mongoose.model(SchemaNames.subtitles, SubtitlesSchemas.SubtitlesSchema);
const TranslationExport = mongoose.model(SchemaNames.translationExport, TranslationExportSchemas.TranslationExportSchema);
const BulkTranslationExport = mongoose.model(SchemaNames.bulkTranslationExport, TranslationExportSchemas.BulkTranslationExportSchema);
const User = mongoose.model(SchemaNames.user, UserSchemas.UserSchema);
const VideoTutorialContribution = mongoose.model(SchemaNames.videoTutorialContribution, VideoTutorialContributionSchemas.VideoTutorialContributionSchema)
const NoiseCancellationVideo = mongoose.model(SchemaNames.noiseCancellationVideo, NoiseCancellationVideoSchemas.NoiseCancellationVideoSchema);
const SocketConnection = mongoose.model(SchemaNames.socketConnection, SocketConnectionSchemas.SocketConnectionSchema)
const ImageTranslationExport = mongoose.model(SchemaNames.imageTranslationExport, ImageTranslationExportSchemas.ImageTranslationExportSchema);

module.exports = {
    Video,
    Image,
    Article,
    ApiKey,
    Comment,
    Folder,
    Notification,
    Organization,
    Subtitles,
    TranslationExport,
    BulkTranslationExport,
    User,
    VideoTutorialContribution,
    NoiseCancellationVideo,
    SocketConnection,
    ImageTranslationExport,
};
