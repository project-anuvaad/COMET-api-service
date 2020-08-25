const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const CONVERT_STATUS_ENUM = ['uploaded', 'processing', 'done', 'failed'];

const NoiseCancellationVideoSchema = new Schema({
    url: { type: String },
    noiseCancelledUrl: { type: String },
    title: { type: String },
    Key: { type: String },
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },
    uploadedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
    status: { type: String, enum: CONVERT_STATUS_ENUM, default: 'uploading' },
    created_at: { type: Date, default: Date.now, index: true },
})

module.exports = { NoiseCancellationVideoSchema };