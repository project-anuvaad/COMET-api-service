const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { SchemaNames } = require("./utils/schemaNames");

const TYPE_ENUM = ["original", "translation"];

const ImageSchema = new Schema({
  url: { type: String },
  title: { type: String },
  langCode: { type: String },
  organization: {
    type: Schema.Types.ObjectId,
    index: true,
    ref: SchemaNames.organization,
  },
  type: { type: String, enum: TYPE_ENUM, default: "original" },
  uploadedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
  created_at: { type: Date, default: Date.now, index: true },
});

module.exports = { ImageSchema };
