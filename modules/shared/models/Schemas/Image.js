const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { SchemaNames } = require("./utils/schemaNames");

const TYPE_ENUM = ["original", "translation"];

const ObjectSchema = new Schema({
  type: { type: String, enum: ["rect", "text", "circle", "oval"] },
  top: Number,
  left: Number,
  width: Number,
  height: Number,
  originX: String,
  originY: String,

  fill: String,
  fillRule: String,
  stroke: String,
  strokeLineCap: String,
  strokeLineJoin: String,
  strokeMiterLimit: Number,
  strokeWidth: Number,
  opacity: Number,
  visible: Boolean,
  // Circle radius
  radius: Number,
  // Oval radius X and radius Y
  rx: Number,
  ry: Number,

  // Text
  fontWeight: String,
  fontSize: Number,
  text: String,
});

const GroupSchema = new Schema({
  // stroke: String,
  // strokeWidth: Number,
  // strokeLineCap: String,
  // strokeLineJoin: String,
  // strokeMiterLimit: Number,
  opacity: Number,
  visible: Boolean,
  angle: Number,
  top: Number,
  left: Number,
  height: Number,
  width: Number,
  originX: { type: String, enum: ["left", "center"] },
  originY: { type: String, enum: ["top", "center"] },
  objects: [ObjectSchema],
});

const ImageSchema = new Schema({
  url: { type: String },
  title: { type: String },
  langCode: { type: String },
  organization: {
    type: Schema.Types.ObjectId,
    index: true,
    ref: SchemaNames.organization,
  },

  width: { type: Number },
  height: { type: Number },
  displayWidth: { type: Number },
  displayHeight: { type: Number },

  //groups: [{ type: Schema.Types.Mixed }],
  groups: [GroupSchema],
  groupsColors: [{ type: Schema.Types.Mixed }],

  status: { type: String, default: "uploaded", enum: ["uploaded", "done"] },
  type: { type: String, enum: TYPE_ENUM, default: "original" },
  uploadedBy: { type: Schema.Types.ObjectId, ref: SchemaNames.user },
  created_at: { type: Date, default: Date.now, index: true },
});

module.exports = { ImageSchema };
