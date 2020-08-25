const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const NOTIFICATIONS_TYPES = [
    'invited_to_translate',
    'invited_to_translate_text',
    'invited_to_translate_text_accepted',
    'invited_to_translate_text_declined',
    'invited_to_translate_accepted',
    'invited_to_translate_declined',
    'invited_to_verify',
    'invited_to_lead_translation',
    'translation_export_request',
    'added_comment_to_translation',
    'review_marked_as_done',
];
const RESOURCE_TYPES = [
    'video',
    'article',
]

const NotificationSchema = new Schema({
    owner: { type: Schema.Types.ObjectId, ref: SchemaNames.user, index: true },
    from: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },
    
    type: { type: String, enum: NOTIFICATIONS_TYPES },
    read: { type: Boolean, default: false },

    content: { type: String },
    extraContent: { type: String },
    
    hasStatus: { type: Boolean, default: false },
    status: { type: String, enum: ['accepted', 'declined', 'pending'] },
    inviteToken: { type: String },
    
    resource: { type: String },
    resourceType: { type: String, enum: RESOURCE_TYPES },

    data: { type: Schema.Types.Mixed },

    created_at: { type: Date, default: Date.now, index: true },
});


module.exports = { NotificationSchema };
