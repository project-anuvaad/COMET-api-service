const VideoModel = require('../models').Video;

const BaseHandler = require('./BaseHandler');

class VideoHandler extends BaseHandler {
    constructor() {
        super(VideoModel);
    }
}

module.exports = new VideoHandler();