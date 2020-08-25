const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SchemaNames } = require('./utils/schemaNames');

const ApiDocsSubscriber = new Schema({
    email: { type: String, unique: true },
})

// const CommentsThread = new Schema({
//     comments: [Comment]
// })

module.exports = { ApiDocsSubscriber };