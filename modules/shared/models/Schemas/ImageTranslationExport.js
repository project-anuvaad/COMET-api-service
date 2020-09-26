const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const EXPORT_REQUEST_STATUS = ['pending', 'approved', 'declined'];
const STATUS_ENUM = ['queued', 'processing', 'done', 'failed'];

const ImageTranslationExportSchema = new Schema({
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization, index: true },
    version: Number,
    subversion: Number,
    image: { type: Schema.Types.ObjectId, ref: SchemaNames.image, index: true },

    exportRequestStatus: { type: String, enum: EXPORT_REQUEST_STATUS, default: 'pending' },

    exportRequestBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
    translationBy: [{ type: Schema.Types.ObjectId, ref: SchemaNames.user }],
    approvedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
    declinedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },

    progress: { type: Number, default: 0 },
    status: { type: String, enum: STATUS_ENUM },

    imageUrl: { type: String },

    version: { type: Number, default: 1 },
    subVersion: { type: Number, default: 0 },

    created_at: { type: Date, default: Date.now, index: true },
})





module.exports = { ImageTranslationExportSchema };