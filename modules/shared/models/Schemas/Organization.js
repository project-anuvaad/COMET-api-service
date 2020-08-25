const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrganizationSchema = new Schema({
    name: { type: String, unique: true },
    origins: [String],
    logo: { type: String },
});

module.exports = { OrganizationSchema };