const { SchemaNames } = require('./utils/schemaNames');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SLIDE_CONVERT_STATUS_ENUMS = ['processing', 'done', 'failed'];
const ARTICLE_TYPE_ENUM = ['original', 'transcription_version', 'translation', 'translation_version'];
const ARTICLE_STAGE_ENUM = ['signlanguage_translation', 'signlanguage_translation_done', 'text_translation', 'text_translation_done', 'voice_over_translation', 'voice_over_translation_done', 'done'];
const MEDIA_TYPES_ENUM = ['image', 'video', 'gif'];
const SPEAKER_GENDER_ENUM = ['male', 'female'];

const MediaSchema = new Schema({
    url: { type: String },
    mediaKey: { type: String },
    duration: { type: Number },
    originalDuration: { type: Number },
    mediaType: { type: String, enum: MEDIA_TYPES_ENUM, default: 'image' },
});

const SpeakerProfileSchema = new Schema({
    speakerGender: { type: String, enum: SPEAKER_GENDER_ENUM },
    speakerNumber: { type: Number }, // To be Speaker 1, Speaker 2, Speaker 3...etc
})

const SlideSpeakerSchema = new Schema({
    text: { type: String, default: '' },
    name: { type: String, default: '' },
    translationVersionArticleId: { type: Schema.Types.ObjectId, ref: 'article' },

    transcriptionVersionArticleId: { type: Schema.Types.ObjectId, ref: 'article' },
    AITranscriptionLoading: { type: Boolean, default: false },

    audio: { type: String },
    rawAudio: { type: String },

    audioDuration: { type: Number },
    audioKey: { type: String },
    audioFileName: { type: String },
    audioUser: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    audioSpeed: { type: Number, default: 1 },

    // boolean of latest audio was processed
    audioProcessed: { type: Boolean, default: false },
    // url of processed audio link
    processedAudio: { type: String },
    processedAudioKey: { type: String },
    processedAudioFileName: { type: String },

    audioSynced: { type: Boolean, default: false },
    audioSource: { type: String, enum: ['user', 'tts', 'original'], },

    picInPicPosition: { type: String, enum: ['tl', 'tr', 'bl', 'br'], default: 'tr' },
    picInPicVideoUrl: { type: String },
    picInPicFileName: { type: String },
    picInPicKey: { type: String },
    picInPicUser: { type: Schema.Types.ObjectId, ref: SchemaNames.user },

    speakerProfile: SpeakerProfileSchema,
    media: [MediaSchema],
    silent: { type: Boolean, default: false },

    position: { type: Number },
    videoSpeed: { type: Number, default: 1 },

    startTime: { type: Number },
    endTime: { type: Number },

    originalStartTime: { type: Number },
    originalEndTime: { type: Number },
})

const SlideSchema = new Schema({
    content: [SlideSpeakerSchema],
    // text: { type: String },
    // audio: { type: String }, // the content audios combined together
    // duration: { type: Number },
    // speakerProfile: SpeakerProfileSchema,
    video: { type: String }, // the final video of the slide
    position: { type: Number },
    /*
        The slide content and media are combined together to form a video,
        this field should track the process
    */
    convertStatus: { type: String, enum: SLIDE_CONVERT_STATUS_ENUMS },
    commentsThread: { type: Schema.Types.ObjectId, },
});

const TranslatorSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    speakerNumber: { type: Number, required: true },
    invitationStatus: { type: String, enum: ['accepted', 'declined', 'pending'], default: 'pending' },
    inviteToken: { type: String },
    invitedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    finishDate: { type: Number }
})

const InvitedUserSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    invitationStatus: { type: String, enum: ['accepted', 'declined', 'pending'], default: 'pending' },
    inviteToken: { type: String },
    invitedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    finishDate: { type: Number }
})


const TextTranslatorSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    invitationStatus: { type: String, enum: ['accepted', 'declined', 'pending'], default: 'pending' },
    inviteToken: { type: String },
    invitedBy: { type: Schema.Types.ObjectId, },
    finishDate: { type: Number }
})

const ArticleSchema = new Schema({
    title: { type: String },
    version: { type: Number, default: 1 },
    slides: [SlideSchema],
    video: { type: Schema.Types.ObjectId, ref: SchemaNames.video, },
    commentsThread: { type: Schema.Types.ObjectId, },
    numberOfSpeakers: { type: Number, default: 1 },
    speakersProfile: [SpeakerProfileSchema],
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization, },
    converted: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    // this field indicates if the media is being re-generated for the article
    refreshing: { type: Boolean, default: false },
    // This field controls wether this article is transcriped in one language 
    // and got proofread/reviewed in English language
    toEnglish: { type: Boolean, default: false },
    /* 
        language field is the original language of the video
        when someone clones the article to translate it,
        this field should be set to be the target
        language
    */
    langCode: { type: String },
    langName: { type: String },
    // Decides wether the article's audio is controlled by the users or tts generated audios
    tts: { type: Boolean, default: false },
    // Wether the language is sign language
    signLang: { type: Boolean, default: false },
    // Either an original article or a translation article ( cloned by a translator to be translated )
    articleType: { type: String, enum: ARTICLE_TYPE_ENUM, default: 'original' },
    stage: { type: String, enum: ARTICLE_STAGE_ENUM },
    // special fields for translation articleType
    videoSpeed: { type: Number, default: 1 },
    videoSpeedLoading: { type: Boolean, default: false },
    // translation start/end time of a slide is being updated
    videoSliceLoading: { type: Boolean, default: false },
    // text translation progress
    translationProgress: { type: Number, default: 0 },
    // voice over translation progress
    voiceOverProgress: { type: Number, default: 0 },
    // Set to the original article that the translation was cloned from
    originalArticle: { type: Schema.Types.ObjectId, ref: 'article' },
    // the user who cloned the article to translate it
    translators: [TranslatorSchema],
    textTranslators: [TextTranslatorSchema],
    verifiers: [{ type: Schema.Types.ObjectId, ref: SchemaNames.user }],
    projectLeaders: [InvitedUserSchema],
    // Wether to run audio compression/normalization on the exported video
    normalizeAudio: { type: Boolean, default: true },
    // Audio volume of the speaker in the exported video
    volume: { type: Number, default: 1 },
    // If the the article have been exported thus wasnt updated
    exported: { type: Boolean, default: false },
    reviewCompleted: { type: Boolean, default: false, },
    originalTimingSet: { type: Boolean, default: false },

    // Special fields for translation_version type
    // For each article of type translation_version, it's connected to a translation article
    translationArticle: { type: Schema.Types.ObjectId, ref: 'article' },
    translationVersionBy: { type: String },

    // Special fields for transcription_version type
    isAITranscription: { type: Boolean, default: false },
    AITranscriptionFinishSubscribers: [{ type: Schema.Types.ObjectId, ref: SchemaNames.user }],

    // For each article of type transcription_version, it's connected to a transcription/original article
    transcriptionArticle: { type: Schema.Types.ObjectId, ref: 'article' },

});

module.exports = { ArticleSchema };
