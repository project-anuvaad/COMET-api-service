const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const ApiKey = new Schema({
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization , index: true },
    user: { type: Schema.Types.ObjectId, ref: SchemaNames.user, index: true },
    keyType: { type: String, enum: ['platform', 'service'], default: 'platform' },

    key: String,
    secret: String,
    origins: [String],
    active: { type: Boolean, default: true },
    userKey: { type: Boolean, default: false },
    
    created_at: { type: Number, default: Date.now },
})

module.exports = { ApiKey };