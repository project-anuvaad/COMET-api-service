const NoiseCancellationVideoModel = require('../models').NoiseCancellationVideo;

const BaseHandler = require('./BaseHandler');

class NoiseCancellationVideo extends BaseHandler {
    constructor() {
        super(NoiseCancellationVideoModel);
    }
}

module.exports = new NoiseCancellationVideo();