const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { SchemaNames } = require("./utils/schemaNames");

const Comment = new Schema({
  article: { type: Schema.Types.ObjectId, ref: SchemaNames.article, index: true },
  user: { type: Schema.Types.ObjectId, ref: SchemaNames.user, },
  isWhatsappComment: { type: Boolean, default: false },
  whatsappContactNumber: { type: String },

  content: { type: String },

  slidePosition: { type: Number },
  subslidePosition: { type: Number },
  created_at: { type: Number, default: Date.now },
});

// const CommentsThread = new Schema({
//     comments: [Comment]
// })

module.exports = { Comment };
