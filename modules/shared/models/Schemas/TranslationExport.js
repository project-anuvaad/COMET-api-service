const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const EXPORT_REQUEST_STATUS = ['pending', 'approved', 'declined'];
const STATUS_ENUM = ['queued', 'processing', 'done', 'failed'];

const TranslationExportSchema = new Schema({
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },
    article: { type: Schema.Types.ObjectId, ref: SchemaNames.article },
    video: { type: Schema.Types.ObjectId, ref: SchemaNames.video, },
    signLanguageArticle: { type: Schema.Types.ObjectId, ref: SchemaNames.article },

    exportRequestStatus: { type: String, enum: EXPORT_REQUEST_STATUS, default: 'pending' },

    exportRequestBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
    translationBy: [{ type: Schema.Types.ObjectId, ref: SchemaNames.user }],
    approvedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
    declinedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },

    progress: { type: Number, default: 0 },
    status: { type: String, enum: STATUS_ENUM },

    videoUrl: { type: String },
    compressedVideoUrl: { type: String },
    slidesArchiveUrl: { type: String },
    audiosArchiveUrl: { type: String },
    subtitledVideoUrl: { type: String },
    subtitledSignlanguageVideoUrl: { type: String },

    audioArchiveBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
    subtitledVideoBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user  },
    subtitleBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user  },
    subtitledSignlanguageVideoBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user  },
    
    audiosArchiveProgress: { type: Number, default: 0 },
    subtitledVideoProgress: { type: Number, default: 0 },
    subtitleUrl: { type: String },
    subtitleProgress: { type: Number },
    subtitledSignlanguageVideoProgress: { type: Number, default: 0 },

    voiceVolume: { type: Number, default: 1 },
    backgroundMusicVolume: { type: Number, default: 1 },
    normalizeAudio: { type: Boolean, default: true },
    cancelNoise: { type: Boolean, default: true },

    backgroundMusicTransposed: { type: Boolean, default: false },
    hasBackgroundMusic: { type: Boolean, default: false },

    version: { type: Number, default: 1 },
    subVersion: { type: Number, default: 0 },

    created_at: { type: Date, default: Date.now, index: true },
    // Directory name for generated media to be saved in
    dir: { type: String },
})

const BulkTranslationExportSchema = new Schema({
    organization: { type: Schema.Types.ObjectId },
    translationExportIds: [{ type: Schema.Types.ObjectId, ref: SchemaNames.translationExport }],
    finishedTranslationExportIds: [{ type: Schema.Types.ObjectId , ref: SchemaNames.translationExport }],
    exportBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user  },
    zipUrl: { type: String }
})



module.exports = { TranslationExportSchema, BulkTranslationExportSchema };