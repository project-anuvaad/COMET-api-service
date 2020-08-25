const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');


const USER_PERMISSIONS_ENUM = [
    'admin',
    'project_leader',
    'uploader',
    'review',
    'break_videos',
    'transcribe_text',
    'approve_transcriptions',
    'translate',
    'voice_over_artist',
    'translate_text',
    'approve_translations',
];
const REGISTER_METHOD_ENUM = ['api', 'email', 'social', 'invite'];
const INVITE_STATUS_ENUM = ['pending', 'accepted', 'declined'];

const OrganizationRoleSchema = new Schema({
    organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },
    organizationOwner: { type: Boolean, default: false },
    permissions: [{ type: String, enum: USER_PERMISSIONS_ENUM }],
    inviteStatus: { type: String, enum: INVITE_STATUS_ENUM, default: 'pending' },
    // TODO : add select false to inviteToken
    inviteToken: { type: String, select: false},
});

const UserSchema = new Schema({
    firstname: { type: String },
    lastname: { type: String },
    languages: [{ type: String }],
    email: { type: String, unique: true },
    password: { type: String, select: false },

    passwordSet: { type: Boolean, default: false },

    emailVerified: { type: Boolean, default: false },
    verifyToken: { type: String },
    registerMethod: { type: String, enum: REGISTER_METHOD_ENUM, default: 'email' },

    organizationRoles: [OrganizationRoleSchema],
    resetCode: { type: String, select: false },

    apiUser: { type: Boolean, default: false },
    superTranscriber: { type: Boolean, default: false },

    showUserGuiding: { type: Boolean, default: true },
    showCuttingTutorial: { type: Boolean, default: true },
    showProofreadingTutorial: { type: Boolean, default: true },
    showTranslatingTutorial: { type: Boolean, default: true },
});


module.exports = { UserSchema, OrganizationRoleSchema };
