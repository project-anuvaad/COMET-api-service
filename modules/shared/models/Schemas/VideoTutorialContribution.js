const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const VideoTutorialContributionSchema = new Schema({
  url: { type: String },
  title: { type: String },
  Key: { type: String },

  published: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now, index: true },
});

module.exports = { VideoTutorialContributionSchema };
