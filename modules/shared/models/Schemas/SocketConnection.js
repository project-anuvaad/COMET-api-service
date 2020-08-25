const mongoose = require('mongoose')
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const SocketConnectionSchema = new Schema({
  userEmail: { type: String },
  userId: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },

  socketId: { type: String, required: true },
  organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },
  
  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
})

SocketConnectionSchema.pre('save', function (next) {
  const now = new Date()
  this.updated_at = now
  if (!this.created_at) {
    this.created_at = now
  }
  return next();
})

SocketConnectionSchema.statics.isObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id)

SocketConnectionSchema.statics.getObjectId = (id) =>
  mongoose.Types.ObjectId(id)

module.exports = { SocketConnectionSchema };
