const mongoose = require("mongoose");
const { SchemaNames } = require("./utils/schemaNames");
const Schema = mongoose.Schema;

const FolderSchema = new Schema({
  name: { type: String },
  organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization, index: true },
  parent: { type: Schema.Types.ObjectId, ref: SchemaNames.folder },
  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
});

FolderSchema.pre("save", function (next) {
  const now = new Date();
  this.updated_at = now;
  if (!this.created_at) {
    this.created_at = now;
  }
  return next();
});

FolderSchema.statics.isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

FolderSchema.statics.getObjectId = (id) => mongoose.Types.ObjectId(id);


module.exports = { FolderSchema };
