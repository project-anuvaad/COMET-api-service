const videoTutorialContributionHandler = require('../../dbHandlers/videoTutorialContribution');
const BaseService = require('../BaseService');

class VideoTutorialContributionService extends BaseService {
    constructor() {
        super(videoTutorialContributionHandler);
    }
    
}

module.exports = new VideoTutorialContributionService();