const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');
const SPEAKER_GENDER_ENUM = ['male', 'female'];


const SpeakerProfileSchema = new Schema({
    speakerGender: { type: String, enum: SPEAKER_GENDER_ENUM },
    speakerNumber: { type: Number }, // To be Speaker 1, Speaker 2, Speaker 3...etc
})

const SubtitleSchema = new Schema({

    startTime: { type: Number },
    endTime: { type: Number },
    
    position: { type: Number },
    slidePosition: { type: Number },
    subslidePosition: { type: Number },
    
    speakerProfile: SpeakerProfileSchema,
    
    text: { type: String },
    
});
const SubtitlesSchema = new Schema({
    article: { type: Schema.Types.ObjectId, ref: SchemaNames.article, index: true },
    video: { type: Schema.Types.ObjectId, ref: SchemaNames.video },
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },

    subtitles: [SubtitleSchema],
    activated: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now },
})

module.exports = { SubtitlesSchema };