const videoHandler = require('../../dbHandlers/video');
const BaseService = require('../BaseService');

class VideoService extends BaseService {
    constructor() {
        super(videoHandler);
    }

    createVideo(values) {
        return this.create(values)
    }
}

module.exports = new VideoService();