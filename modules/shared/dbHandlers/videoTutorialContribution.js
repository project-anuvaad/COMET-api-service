const VideoTutorialContribution = require('../models').VideoTutorialContribution;

const BaseHandler = require('./BaseHandler');

class VideoTutorialContributionHandler extends BaseHandler {
    constructor() {
        super(VideoTutorialContribution);
    }
}

module.exports = new VideoTutorialContributionHandler();