const SubtitlesModel = require('../models').Subtitles;
const BaseHandler = require('./BaseHandler');

class SubtitlesHandler extends BaseHandler {
    constructor() {
        super(SubtitlesModel);
    }
}

module.exports = new SubtitlesHandler();
